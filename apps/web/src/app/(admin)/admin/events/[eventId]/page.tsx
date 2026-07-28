'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Layers,
  Cpu,
  CheckCircle,
  XCircle,
  Play,
  Download,
  AlertCircle,
  Loader2,
  ShieldAlert,
  Lock,
  Plus,
  Trash2,
  Upload,
  Circle,
} from 'lucide-react';
import {
  getMe,
  getAdminEvent,
  getOnboardingStatus,
  updateEventStatus,
  createAdminTier,
  deleteAdminTier,
  uploadAdminTierImage,
  type AuthUser,
  type EventDetail,
  type TierResponse,
  type OnboardingStatus,
} from '@/lib/api';
import Sidebar from '@/components/layout/Sidebar';
import EventSubNav from '@/components/admin/EventSubNav';
import { ContractAddressRow, ContractExplorerLink } from '@/components/blockchain/ContractExplorerLink';

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function priceToWei(priceInr: number): string {
  return BigInt(Math.round(priceInr * 1e18)).toString();
}

function CheckItem({
  done,
  label,
  explorerValue,
  explorerType = 'address',
}: {
  done: boolean;
  label: string;
  explorerValue?: string;
  explorerType?: 'address' | 'tx';
}) {
  return (
    <div className="flex items-center space-x-2 text-[10px] font-mono">
      {done ? (
        <CheckCircle className="h-3.5 w-3.5 shrink-0 text-green-600" />
      ) : (
        <Circle className="h-3.5 w-3.5 shrink-0 text-zinc-300" />
      )}
      <span className={done ? 'text-zinc-700' : 'text-zinc-400'}>{label}</span>
      {done && explorerValue && (
        <ContractExplorerLink value={explorerValue} type={explorerType} stopPropagation={false} />
      )}
    </div>
  );
}

export default function AdminEventDetailPage({ params }: { params: { eventId: string } }) {
  const eventId = params.eventId;
  const [user, setUser] = useState<AuthUser | null>(null);
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Tier form
  const [showTierForm, setShowTierForm] = useState(false);
  const [tierName, setTierName] = useState('');
  const [tierSupply, setTierSupply] = useState('100');
  const [tierPrice, setTierPrice] = useState('');
  const [tierMaxPerWallet, setTierMaxPerWallet] = useState('4');
  const [tierZone, setTierZone] = useState('');
  const [tierLoading, setTierLoading] = useState(false);
  const [tierError, setTierError] = useState<string | null>(null);
  const [uploadingTierId, setUploadingTierId] = useState<string | null>(null);

  const kycVerified = onboarding?.kycVerified ?? false;
  const tiers = event?.tiers ?? [];
  const allTiersHaveMetadata = tiers.length > 0 && tiers.every((t) => t.metadataIpfsHash);
  const canDeploy =
    kycVerified &&
    event?.status === 'draft' &&
    !event?.contractAddress &&
    tiers.length > 0 &&
    allTiersHaveMetadata;
  const canPublish =
    kycVerified &&
    event?.status === 'draft' &&
    !!event?.contractAddress &&
    tiers.length > 0;

  const fetchEventDetails = async () => {
    const data = await getAdminEvent(eventId);
    if (data) {
      setEvent(data);
    } else {
      setError('Event not found.');
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        const me = await getMe();
        if (!me || me.role < 2) {
          setError('Insufficient permissions.');
          setLoading(false);
          return;
        }
        setUser(me);
        const [, ob] = await Promise.all([
          fetchEventDetails(),
          getOnboardingStatus().catch(() => null),
        ]);
        setOnboarding(ob);
      } catch (err) {
        console.error(err);
        setError('Failed to load event console.');
      } finally {
        setLoading(false);
      }
    })();
  }, [eventId]);

  const handleStatusChange = async (action: 'deploy' | 'publish' | 'go-live' | 'end' | 'cancel') => {
    setActionLoading(action);
    setError(null);
    try {
      await updateEventStatus(eventId, action);
      await fetchEventDetails();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to execute: ${action}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateTier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tierName.trim() || !tierPrice.trim()) {
      setTierError('Tier name and price are required.');
      return;
    }
    const supply = Number(tierSupply);
    const price = Number(tierPrice);
    const maxPerWallet = Number(tierMaxPerWallet);
    if (Number.isNaN(supply) || supply < 1) {
      setTierError('Supply must be at least 1.');
      return;
    }
    if (Number.isNaN(price) || price <= 0) {
      setTierError('Enter a valid price.');
      return;
    }

    setTierLoading(true);
    setTierError(null);
    try {
      await createAdminTier(eventId, {
        name: tierName.trim(),
        zone: tierZone.trim() || undefined,
        totalSupply: supply,
        maxPerWallet: Number.isNaN(maxPerWallet) ? 4 : maxPerWallet,
        priceWei: priceToWei(price),
        priceDisplay: price,
        isTransferable: true,
      });
      setTierName('');
      setTierSupply('100');
      setTierPrice('');
      setTierZone('');
      setShowTierForm(false);
      await fetchEventDetails();
    } catch (err) {
      setTierError(err instanceof Error ? err.message : 'Failed to create tier');
    } finally {
      setTierLoading(false);
    }
  };

  const handleDeleteTier = async (tierId: string) => {
    if (!confirm('Delete this ticket tier?')) return;
    setError(null);
    try {
      await deleteAdminTier(eventId, tierId);
      await fetchEventDetails();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete tier');
    }
  };

  const handleTierImageUpload = async (tierId: string, file: File) => {
    setUploadingTierId(tierId);
    setError(null);
    try {
      const contentBase64 = await fileToBase64(file);
      await uploadAdminTierImage(eventId, tierId, {
        fileName: file.name,
        mimeType: file.type || 'image/png',
        contentBase64,
      });
      await fetchEventDetails();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload tier image');
    } finally {
      setUploadingTierId(null);
    }
  };

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <Sidebar type="admin" />

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-zinc-200 bg-white px-8">
          <div className="flex items-center space-x-2">
            <Link href="/admin/events" className="p-1 text-zinc-400 transition-colors hover:text-zinc-950">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-zinc-400">
              Event Setup
            </h2>
          </div>
          {event && (
            <div className="font-mono text-xs text-zinc-500">
              STATUS: <strong className="uppercase text-zinc-950">{event.status}</strong>
            </div>
          )}
        </header>

        <main className="max-w-5xl flex-1 space-y-8 p-8">
          {error && (
            <div className="flex items-start space-x-2 rounded border border-red-100 bg-red-50 p-3 font-mono text-xs text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="flex h-64 flex-col items-center justify-center space-y-2 text-zinc-400">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-800" />
              <span className="font-mono text-xs">Loading event...</span>
            </div>
          ) : !event ? (
            <div className="rounded border border-zinc-200 bg-white p-12 text-center font-mono text-xs text-zinc-400">
              Event not found.
            </div>
          ) : (
            <div className="space-y-6">
              <EventSubNav eventId={eventId} eventName={event.name} />
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                {/* Event summary */}
                <div className="space-y-4 rounded border border-zinc-200 bg-white p-6">
                  <div className="space-y-1">
                    <span className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-700">
                      Draft Event
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-zinc-100 pt-3 font-mono text-xs text-zinc-500">
                    <p className="flex items-center space-x-1">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>{new Date(event.eventDate).toLocaleString()}</span>
                    </p>
                    <p className="flex items-center space-x-1">
                      <MapPin className="h-3.5 w-3.5" />
                      <span>{[event.venueName, event.city].filter(Boolean).join(', ')}</span>
                    </p>
                  </div>
                  {event.description && (
                    <p className="font-mono text-xs leading-relaxed text-zinc-500">{event.description}</p>
                  )}
                </div>

                {/* Ticket tiers */}
                <div className="space-y-4 rounded border border-zinc-200 bg-white p-6">
                  <div className="flex items-center justify-between">
                    <h3 className="flex items-center space-x-1.5 font-mono text-xs font-bold uppercase tracking-wider text-zinc-400">
                      <Layers className="h-4 w-4" />
                      <span>Ticket Tiers</span>
                    </h3>
                    {event.status === 'draft' && (
                      <button
                        type="button"
                        onClick={() => setShowTierForm(!showTierForm)}
                        className="flex items-center space-x-1 rounded bg-zinc-900 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-zinc-800"
                      >
                        <Plus className="h-3 w-3" />
                        <span>Add Tier</span>
                      </button>
                    )}
                  </div>

                  <p className="font-mono text-[10px] leading-relaxed text-zinc-500">
                    Configure all ticket types for this event while in draft. Each tier is pinned to IPFS
                    automatically and will be deployed on-chain together when you deploy the contract.
                  </p>

                  {showTierForm && event.status === 'draft' && (
                    <form
                      onSubmit={(e) => void handleCreateTier(e)}
                      className="space-y-3 rounded border border-zinc-200 bg-zinc-50 p-4"
                    >
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label className="block font-mono text-[10px] font-bold uppercase text-zinc-400">
                            Tier name *
                          </label>
                          <input
                            type="text"
                            value={tierName}
                            onChange={(e) => setTierName(e.target.value)}
                            placeholder="e.g. General Admission"
                            className="w-full rounded border border-zinc-200 bg-white px-3 py-1.5 font-mono text-xs focus:border-zinc-900 focus:outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block font-mono text-[10px] font-bold uppercase text-zinc-400">
                            Zone
                          </label>
                          <input
                            type="text"
                            value={tierZone}
                            onChange={(e) => setTierZone(e.target.value)}
                            placeholder="e.g. Standing"
                            className="w-full rounded border border-zinc-200 bg-white px-3 py-1.5 font-mono text-xs focus:border-zinc-900 focus:outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block font-mono text-[10px] font-bold uppercase text-zinc-400">
                            Total supply *
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={tierSupply}
                            onChange={(e) => setTierSupply(e.target.value)}
                            className="w-full rounded border border-zinc-200 bg-white px-3 py-1.5 font-mono text-xs focus:border-zinc-900 focus:outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block font-mono text-[10px] font-bold uppercase text-zinc-400">
                            Price (INR) *
                          </label>
                          <input
                            type="number"
                            min={1}
                            step={0.01}
                            value={tierPrice}
                            onChange={(e) => setTierPrice(e.target.value)}
                            placeholder="e.g. 500"
                            className="w-full rounded border border-zinc-200 bg-white px-3 py-1.5 font-mono text-xs focus:border-zinc-900 focus:outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block font-mono text-[10px] font-bold uppercase text-zinc-400">
                            Max per wallet
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={tierMaxPerWallet}
                            onChange={(e) => setTierMaxPerWallet(e.target.value)}
                            className="w-full rounded border border-zinc-200 bg-white px-3 py-1.5 font-mono text-xs focus:border-zinc-900 focus:outline-none"
                          />
                        </div>
                      </div>

                      {tierError && (
                        <p className="font-mono text-xs text-red-600">{tierError}</p>
                      )}

                      <div className="flex justify-end space-x-2">
                        <button
                          type="button"
                          onClick={() => setShowTierForm(false)}
                          className="rounded border border-zinc-200 px-3 py-1.5 font-mono text-[10px] font-bold uppercase hover:bg-zinc-100"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={tierLoading}
                          className="flex items-center space-x-1 rounded bg-zinc-900 px-3 py-1.5 font-mono text-[10px] font-bold uppercase text-white hover:bg-zinc-800 disabled:opacity-40"
                        >
                          {tierLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                          <span>Add Tier</span>
                        </button>
                      </div>
                    </form>
                  )}

                  {tiers.length === 0 ? (
                    <div className="rounded border border-dashed border-zinc-200 p-8 text-center font-mono text-xs text-zinc-400">
                      No ticket tiers yet. Add at least one tier before deploying.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {tiers.map((tier: TierResponse) => (
                        <div
                          key={tier.id}
                          className="flex items-start justify-between rounded border border-zinc-100 bg-zinc-50 p-4"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <span className="font-mono text-xs font-bold uppercase text-zinc-950">
                                {tier.name}
                              </span>
                              {tier.metadataIpfsHash ? (
                                <span className="rounded bg-green-50 px-1.5 py-0.5 font-mono text-[9px] text-green-700">
                                  IPFS READY
                                </span>
                              ) : (
                                <span className="rounded bg-amber-50 px-1.5 py-0.5 font-mono text-[9px] text-amber-700">
                                  NO METADATA
                                </span>
                              )}
                            </div>
                            <p className="font-mono text-[10px] text-zinc-500">
                              Supply: {tier.totalSupply} · Max/wallet: {tier.maxPerWallet}
                              {tier.zone ? ` · Zone: ${tier.zone}` : ''}
                            </p>
                            <p className="font-mono text-xs font-bold text-zinc-900">
                              {tier.priceDisplay ? `₹${tier.priceDisplay}` : `${Number(tier.priceWei) / 1e18} tMSTC`}
                            </p>
                          </div>

                          {event.status === 'draft' && (
                            <div className="flex items-center space-x-2">
                              <label className="cursor-pointer">
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  disabled={uploadingTierId === tier.id}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) void handleTierImageUpload(tier.id, file);
                                    e.target.value = '';
                                  }}
                                />
                                <span className="flex items-center space-x-1 rounded border border-zinc-200 px-2 py-1 font-mono text-[9px] uppercase hover:bg-white">
                                  {uploadingTierId === tier.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Upload className="h-3 w-3" />
                                  )}
                                  <span>Image</span>
                                </span>
                              </label>
                              <button
                                type="button"
                                onClick={() => void handleDeleteTier(tier.id)}
                                className="rounded border border-zinc-200 p-1 text-zinc-400 hover:border-red-200 hover:text-red-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Lifecycle actions */}
                <div className="space-y-4 rounded border border-zinc-200 bg-white p-6">
                  <h3 className="flex items-center space-x-1.5 font-mono text-xs font-bold uppercase tracking-wider text-zinc-400">
                    <Cpu className="h-4 w-4" />
                    <span>Release Controls</span>
                  </h3>

                  {!kycVerified && (
                    <div className="flex items-start space-x-2.5 rounded border border-amber-200 bg-amber-50 p-3">
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                      <div>
                        <p className="font-mono text-[10px] font-bold uppercase tracking-wide text-amber-800">
                          KYC approval required to deploy &amp; release
                        </p>
                        <p className="mt-0.5 font-mono text-[10px] leading-relaxed text-amber-700">
                          You can configure this event and its ticket tiers now. Deploying the contract
                          and releasing tickets for minting unlocks once your organisation KYC is approved.
                        </p>
                        {!onboarding?.kycSubmitted && (
                          <Link
                            href="/admin/onboarding"
                            className="mt-1 inline-block font-mono text-[10px] font-bold text-amber-800 underline hover:text-amber-900"
                          >
                            Complete onboarding →
                          </Link>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {!kycVerified ? (
                      <div className="flex flex-col items-center justify-center rounded border border-amber-200 bg-amber-50 p-3 text-center">
                        <Lock className="h-5 w-5 text-amber-400" />
                        <span className="mt-1 font-mono text-[9px] font-bold text-amber-700">1. DEPLOY</span>
                        <span className="font-mono text-[8px] text-amber-500">KYC REQUIRED</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={!canDeploy || actionLoading !== null}
                        onClick={() => void handleStatusChange('deploy')}
                        className="flex flex-col items-center justify-center rounded border border-zinc-200 p-3 text-center transition-colors hover:border-zinc-950 disabled:opacity-40"
                      >
                        {actionLoading === 'deploy' ? (
                          <Loader2 className="h-5 w-5 animate-spin text-zinc-950" />
                        ) : (
                          <Cpu className="h-5 w-5 text-zinc-700" />
                        )}
                        <span className="mt-1 font-mono text-[9px] font-bold">1. DEPLOY CONTRACT</span>
                        <span className="font-mono text-[8px] text-zinc-400">All tiers on-chain</span>
                      </button>
                    )}

                    {!kycVerified ? (
                      <div className="flex flex-col items-center justify-center rounded border border-amber-200 bg-amber-50 p-3 text-center">
                        <Lock className="h-5 w-5 text-amber-400" />
                        <span className="mt-1 font-mono text-[9px] font-bold text-amber-700">2. RELEASE</span>
                        <span className="font-mono text-[8px] text-amber-500">KYC REQUIRED</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={!canPublish || actionLoading !== null}
                        onClick={() => void handleStatusChange('publish')}
                        className="flex flex-col items-center justify-center rounded border border-zinc-200 p-3 text-center transition-colors hover:border-zinc-950 disabled:opacity-40"
                      >
                        {actionLoading === 'publish' ? (
                          <Loader2 className="h-5 w-5 animate-spin text-zinc-950" />
                        ) : (
                          <CheckCircle className="h-5 w-5 text-zinc-700" />
                        )}
                        <span className="mt-1 font-mono text-[9px] font-bold">2. RELEASE FOR SALE</span>
                        <span className="font-mono text-[8px] text-zinc-400">Enable minting</span>
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={event.status !== 'published' || actionLoading !== null}
                      onClick={() => void handleStatusChange('go-live')}
                      className="flex flex-col items-center justify-center rounded border border-zinc-200 p-3 text-center transition-colors hover:border-zinc-950 disabled:opacity-40"
                    >
                      {actionLoading === 'go-live' ? (
                        <Loader2 className="h-5 w-5 animate-spin text-zinc-950" />
                      ) : (
                        <Play className="h-5 w-5 text-zinc-700" />
                      )}
                      <span className="mt-1 font-mono text-[9px] font-bold">3. OPEN GATES</span>
                    </button>

                    <button
                      type="button"
                      disabled={event.status !== 'live' || actionLoading !== null}
                      onClick={() => void handleStatusChange('end')}
                      className="flex flex-col items-center justify-center rounded border border-zinc-200 p-3 text-center transition-colors hover:border-zinc-950 disabled:opacity-40"
                    >
                      {actionLoading === 'end' ? (
                        <Loader2 className="h-5 w-5 animate-spin text-zinc-950" />
                      ) : (
                        <Download className="h-5 w-5 text-zinc-700" />
                      )}
                      <span className="mt-1 font-mono text-[9px] font-bold">4. END EVENT</span>
                    </button>

                    <button
                      type="button"
                      disabled={['ended', 'cancelled'].includes(event.status) || actionLoading !== null}
                      onClick={() => void handleStatusChange('cancel')}
                      className="flex flex-col items-center justify-center rounded border border-zinc-200 p-3 text-center transition-colors hover:border-red-900 disabled:opacity-40"
                    >
                      {actionLoading === 'cancel' ? (
                        <Loader2 className="h-5 w-5 animate-spin text-zinc-950" />
                      ) : (
                        <XCircle className="h-5 w-5 text-zinc-700" />
                      )}
                      <span className="mt-1 font-mono text-[9px] font-bold">CANCEL</span>
                    </button>
                  </div>

                  {event.contractAddress && (
                    <ContractAddressRow
                      label="Contract:"
                      address={event.contractAddress}
                      className="font-mono text-[10px] text-zinc-500"
                    />
                  )}
                </div>
              </div>

              {/* Readiness checklist */}
              <div className="space-y-6">
                <div className="space-y-4 rounded border border-zinc-200 bg-white p-6">
                  <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-zinc-400">
                    Deployment Checklist
                  </h3>
                  <div className="space-y-2">
                    <CheckItem done={tiers.length > 0} label="At least one ticket tier" />
                    <CheckItem done={allTiersHaveMetadata} label="All tiers have IPFS metadata" />
                    <CheckItem done={kycVerified} label="Organisation KYC verified" />
                    <CheckItem
                      done={!!event.contractAddress}
                      label="Contract deployed on-chain"
                      explorerValue={event.contractAddress ?? undefined}
                    />
                    {event.contractDeploymentTx && (
                      <CheckItem
                        done
                        label="Deploy transaction"
                        explorerValue={event.contractDeploymentTx}
                        explorerType="tx"
                      />
                    )}
                    <CheckItem
                      done={event.status === 'published' || event.status === 'live'}
                      label="Tickets released for minting"
                    />
                  </div>
                </div>

                <div className="space-y-2 rounded border border-zinc-200 bg-zinc-50 p-4 font-mono text-[10px] leading-relaxed text-zinc-500">
                  <p className="font-bold uppercase text-zinc-700">How it works</p>
                  <p>1. Add all ticket tiers while the event is in draft.</p>
                  <p>2. After KYC approval, deploy the contract — all tiers are configured on-chain.</p>
                  <p>3. Release for sale to make tickets available for minting.</p>
                  {event.resaleEnabled && (
                    <p>4. Resale is enabled — buyers can list tickets on the marketplace after purchase.</p>
                  )}
                </div>
              </div>
            </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
