'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Building2,
  Check,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  MapPin,
  Palette,
  User,
  Wallet,
  X,
} from 'lucide-react';
import {
  getPlatformOrganisation,
  updateTenantCommission,
  updateTenantKyc,
  type PlatformOrganisationDetail,
  type PlatformTenant,
} from '@/lib/api';
import { toDisplayImageUrl } from '@/lib/media';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">{label}</dt>
      <dd className="text-xs font-mono text-zinc-900 break-words">{value ?? '—'}</dd>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 border-b border-zinc-100 pb-5 last:border-0 last:pb-0">
      <h4 className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">
        <Icon className="w-3.5 h-3.5" />
        {title}
      </h4>
      {children}
    </section>
  );
}

function statusBadge(kind: 'verification' | 'status', value: string) {
  const v = (value || 'unknown').toLowerCase();
  const ok =
    kind === 'verification'
      ? v === 'verified'
      : v === 'active';
  const warn =
    kind === 'verification'
      ? v === 'under_review' || v === 'unverified'
      : v === 'pending_verification';
  return (
    <span
      className={`px-2 py-0.5 border rounded text-[9px] font-bold font-mono uppercase ${
        ok
          ? 'bg-zinc-100 border-zinc-200 text-zinc-700'
          : warn
            ? 'bg-amber-50 border-amber-200 text-amber-800'
            : 'bg-red-50 border-red-100 text-red-700'
      }`}
    >
      {value || 'unknown'}
    </span>
  );
}

function isLikelyImage(url: string) {
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(url) || url.startsWith('ipfs://');
}

interface Props {
  tenantId: string;
  onClose: () => void;
  onUpdated: (patch: Partial<PlatformTenant> & { id: string }) => void;
}

export default function TenantDetailDrawer({ tenantId, onClose, onUpdated }: Props) {
  const [org, setOrg] = useState<PlatformOrganisationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commission, setCommission] = useState(200);
  const [saving, setSaving] = useState(false);
  const [kycBusy, setKycBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const detail = await getPlatformOrganisation(tenantId);
        if (cancelled) return;
        setOrg(detail);
        setCommission(detail.platformCommissionBps);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load organisation');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const handleSaveCommission = async () => {
    if (!org) return;
    setSaving(true);
    setActionMsg(null);
    try {
      await updateTenantCommission(org.id, commission);
      setOrg((prev) => (prev ? { ...prev, platformCommissionBps: commission } : prev));
      onUpdated({ id: org.id, platformCommissionBps: commission });
      setActionMsg('Commission updated.');
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Failed to update commission');
    } finally {
      setSaving(false);
    }
  };

  const handleKyc = async (action: 'verified' | 'suspended') => {
    if (!org) return;
    setKycBusy(true);
    setActionMsg(null);
    try {
      await updateTenantKyc(org.id, action);
      const verificationStatus = action === 'verified' ? 'verified' : 'rejected';
      const status = action === 'verified' ? 'active' : 'pending_verification';
      setOrg((prev) => (prev ? { ...prev, verificationStatus, status } : prev));
      onUpdated({ id: org.id, verificationStatus, status });
      setActionMsg(action === 'verified' ? 'Organisation approved.' : 'Organisation rejected.');
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'KYC update failed');
    } finally {
      setKycBusy(false);
    }
  };

  const logoSrc = toDisplayImageUrl(org?.logoUrl);
  const bannerSrc = toDisplayImageUrl(org?.bannerUrl);
  const docs = org?.kycDocuments ?? [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex justify-end bg-black/35"
      onClick={onClose}
    >
      <motion.aside
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 40, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-xl bg-white border-l border-zinc-200 shadow-2xl flex flex-col"
      >
        <header className="shrink-0 border-b border-zinc-100 px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5" />
              Organisation review
            </p>
            <h3 className="text-base font-mono font-bold uppercase text-zinc-950 truncate">
              {org?.name ?? 'Loading…'}
            </h3>
            {org && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-mono text-zinc-500">{org.slug}</span>
                {statusBadge('verification', org.verificationStatus)}
                {statusBadge('status', org.status)}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {loading ? (
            <div className="h-48 flex flex-col items-center justify-center gap-2 text-zinc-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-xs font-mono">Loading organisation…</span>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-100 text-red-700 text-xs font-mono p-3 rounded">
              {error}
            </div>
          ) : org ? (
            <>
              {(bannerSrc || logoSrc) && (
                <div className="rounded border border-zinc-100 overflow-hidden bg-zinc-50">
                  {bannerSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={bannerSrc} alt="" className="w-full h-28 object-cover" />
                  ) : (
                    <div className="h-16 bg-zinc-100" />
                  )}
                  {logoSrc && (
                    <div className="px-4 -mt-6 pb-3 flex items-end gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={logoSrc}
                        alt=""
                        className="w-14 h-14 rounded border border-white bg-white object-cover shadow-sm"
                      />
                      <div className="pb-1 min-w-0">
                        <p className="text-xs font-mono font-bold text-zinc-900 truncate">{org.name}</p>
                        {org.websiteUrl && (
                          <a
                            href={org.websiteUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-500 hover:text-zinc-900"
                          >
                            <Globe className="w-3 h-3" />
                            Website
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <Section title="Profile" icon={Building2}>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Name" value={org.name} />
                  <Field label="Slug" value={org.slug} />
                  <Field label="Type" value={org.orgType ?? '—'} />
                  <Field label="Plan" value={org.subscriptionPlan} />
                  <div className="sm:col-span-2">
                    <Field label="Description" value={org.description || '—'} />
                  </div>
                  <Field
                    label="Website"
                    value={
                      org.websiteUrl ? (
                        <a
                          href={org.websiteUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline hover:text-zinc-600"
                        >
                          {org.websiteUrl}
                        </a>
                      ) : (
                        '—'
                      )
                    }
                  />
                  <Field label="Chain ID" value={org.chainId} />
                </dl>
              </Section>

              <Section title="Branding" icon={Palette}>
                <dl className="grid grid-cols-2 gap-3">
                  <Field
                    label="Primary"
                    value={
                      org.brandPrimaryColor ? (
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="inline-block w-3.5 h-3.5 rounded border border-zinc-200"
                            style={{ background: org.brandPrimaryColor }}
                          />
                          {org.brandPrimaryColor}
                        </span>
                      ) : (
                        '—'
                      )
                    }
                  />
                  <Field
                    label="Secondary"
                    value={
                      org.brandSecondaryColor ? (
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="inline-block w-3.5 h-3.5 rounded border border-zinc-200"
                            style={{ background: org.brandSecondaryColor }}
                          />
                          {org.brandSecondaryColor}
                        </span>
                      ) : (
                        '—'
                      )
                    }
                  />
                </dl>
              </Section>

              <Section title="Legal & location" icon={MapPin}>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Registration no." value={org.registrationNumber} />
                  <Field label="Tax ID / PAN" value={org.taxId} />
                  <Field label="GST" value={org.gstNumber} />
                  <Field label="Country" value={org.country} />
                  <Field label="State" value={org.state} />
                  <Field label="City" value={org.city} />
                  <Field label="Postal code" value={org.postalCode} />
                </dl>
              </Section>

              <Section title="Founder & wallet" icon={User}>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Founder name" value={org.founderName} />
                  <Field label="Founder phone" value={org.founderPhone} />
                  <Field label="Pending founder email" value={org.pendingFounderEmail} />
                  <Field
                    label="Payout wallet"
                    value={
                      org.superAdminWalletAddress ? (
                        <span className="inline-flex items-center gap-1">
                          <Wallet className="w-3 h-3 text-zinc-400 shrink-0" />
                          {org.superAdminWalletAddress}
                        </span>
                      ) : (
                        '—'
                      )
                    }
                  />
                  <Field
                    label="Wallet confirmed"
                    value={org.walletConfirmedAt ? new Date(org.walletConfirmedAt).toLocaleString() : 'Not confirmed'}
                  />
                  <Field
                    label="Verified at"
                    value={org.verifiedAt ? new Date(org.verifiedAt).toLocaleString() : '—'}
                  />
                </dl>
              </Section>

              <Section title="KYC documents" icon={FileText}>
                {docs.length === 0 ? (
                  <p className="text-xs font-mono text-zinc-400 border border-dashed border-zinc-200 rounded p-4 text-center">
                    No KYC documents submitted yet.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {docs.map((doc) => {
                      const href = toDisplayImageUrl(doc.url) ?? doc.url;
                      const showPreview = isLikelyImage(doc.url);
                      return (
                        <li
                          key={`${doc.type}-${doc.url}`}
                          className="border border-zinc-200 rounded p-3 space-y-2 bg-zinc-50/50"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-mono font-bold text-zinc-900">{doc.label}</p>
                              <p className="text-[10px] font-mono text-zinc-400 uppercase">{doc.type.replace(/_/g, ' ')}</p>
                            </div>
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              className="shrink-0 inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase text-zinc-700 hover:text-zinc-950"
                            >
                              Open <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                          {showPreview && href && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={href}
                              alt={doc.label}
                              className="w-full max-h-48 object-contain rounded border border-zinc-200 bg-white"
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Section>

              <Section title="Platform settings" icon={Check}>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">
                      Commission (bps) — 100 bps = 1%
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={0}
                        max={10000}
                        value={commission}
                        onChange={(e) => setCommission(Number(e.target.value))}
                        className="flex-1 bg-zinc-50 border border-zinc-200 rounded px-3 py-2 text-xs font-mono text-zinc-900 focus:outline-none focus:border-zinc-400"
                      />
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleSaveCommission()}
                        className="px-3 py-2 bg-zinc-900 text-white rounded text-[10px] font-mono font-bold uppercase hover:bg-zinc-800 disabled:opacity-40"
                      >
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                    <p className="text-[10px] font-mono text-zinc-400">
                      Current effective rate: {(commission / 100).toFixed(2)}%
                    </p>
                  </div>
                  <dl className="grid grid-cols-2 gap-3">
                    <Field label="Created" value={new Date(org.createdAt).toLocaleString()} />
                    <Field label="Updated" value={new Date(org.updatedAt).toLocaleString()} />
                  </dl>
                </div>
              </Section>

              {actionMsg && (
                <p className="text-xs font-mono text-zinc-600 bg-zinc-50 border border-zinc-100 rounded px-3 py-2">
                  {actionMsg}
                </p>
              )}
            </>
          ) : null}
        </div>

        {org && !loading && (
          <footer className="shrink-0 border-t border-zinc-100 px-5 py-4 flex flex-wrap gap-2 bg-white">
            {org.verificationStatus !== 'verified' && (
              <>
                <button
                  type="button"
                  disabled={kycBusy}
                  onClick={() => void handleKyc('verified')}
                  className="flex-1 min-w-[120px] py-2.5 bg-zinc-900 text-white rounded text-xs font-mono font-bold uppercase hover:bg-zinc-800 disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
                >
                  {kycBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Approve KYC
                </button>
                <button
                  type="button"
                  disabled={kycBusy}
                  onClick={() => void handleKyc('suspended')}
                  className="flex-1 min-w-[120px] py-2.5 bg-white border border-zinc-200 text-zinc-700 rounded text-xs font-mono font-bold uppercase hover:bg-zinc-50 disabled:opacity-40"
                >
                  Reject
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-zinc-200 rounded text-xs font-mono font-bold uppercase text-zinc-600 hover:bg-zinc-50"
            >
              Close
            </button>
          </footer>
        )}
      </motion.aside>
    </motion.div>
  );
}
