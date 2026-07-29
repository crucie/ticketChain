'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Calendar,
  Layers,
  UserCheck,
  AlertCircle,
  Mail,
  Wallet,
  Building2,
} from 'lucide-react';
import {
  getMe,
  getAdminOrganisation,
  getAdminEvents,
  getAdminOrgContext,
  getOnboardingStatus,
  acceptOrgInvite,
  getMyPendingInvites,
  type AdminOrgDetails,
  type AdminEventSummary,
  type OnboardingStatus,
} from '@/lib/api';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { AdminEventsExpandable } from '@/components/admin/AdminEventsExpandable';

type PendingInvite = Awaited<ReturnType<typeof getMyPendingInvites>>[number];

const bentoCard =
  'bg-white border border-zinc-200 rounded-xl p-5 sm:p-6 shadow-sm hover:border-zinc-300 transition-colors';

function roleLabel(role: number): string {
  if (role === 3) return 'Super Admin';
  if (role === 2) return 'Admin';
  return 'Volunteer';
}

export default function AdminDashboardPage() {
  const [org, setOrg] = useState<AdminOrgDetails | null>(null);
  const [events, setEvents] = useState<AdminEventSummary[]>([]);
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [inviteToken, setInviteToken] = useState('');
  const [acceptingInvite, setAcceptingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccessMsg, setInviteSuccessMsg] = useState<string | null>(null);

  const loadDashboardData = async () => {
    try {
      const me = await getMe();
      if (!me || me.role < 2) {
        setError('Insufficient permissions. Organisation Admin role required.');
        setLoading(false);
        return;
      }
      if (me.role === 99 && !getAdminOrgContext()) {
        window.location.replace('/platform/organisations');
        return;
      }
      const [orgData, eventsData, onboardingData, invitesData] = await Promise.all([
        getAdminOrganisation(),
        getAdminEvents().catch(() => [] as AdminEventSummary[]),
        getOnboardingStatus().catch(() => null),
        getMyPendingInvites().catch(() => []),
      ]);

      setOrg(orgData);
      setEvents(eventsData);
      setOnboarding(onboardingData);
      setPendingInvites(invitesData);
    } catch (err) {
      console.error(err);
      setError('Failed to load admin dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboardData();
  }, []);

  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteToken.trim()) return;
    await processAcceptInvite(inviteToken.trim());
  };

  const processAcceptInvite = async (token: string) => {
    setAcceptingInvite(true);
    setInviteError(null);
    setInviteSuccessMsg(null);
    try {
      const result = await acceptOrgInvite(token);
      setInviteSuccessMsg(`Successfully joined ${result.org?.name || 'organisation'}!`);
      setInviteToken('');
      await loadDashboardData();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to accept invitation');
    } finally {
      setAcceptingInvite(false);
    }
  };

  const totalSold = events.reduce((sum, e) => sum + e.totalTicketsSold, 0);
  const totalCheckedIn = events.reduce((sum, e) => sum + (e.totalCheckedIn ?? 0), 0);
  const checkInRate = totalSold > 0 ? `${((totalCheckedIn / totalSold) * 100).toFixed(0)}%` : '0%';

  return (
    <AdminPageShell className="max-w-7xl w-full mx-auto">
      {error ? (
        <div className={`${bentoCard} p-12 text-center max-w-md mx-auto space-y-4`}>
          <AlertCircle className="w-8 h-8 mx-auto text-zinc-400" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-zinc-950">Access Blocked</h3>
            <p className="text-xs text-zinc-500">{error}</p>
          </div>
        </div>
      ) : loading ? (
        <div className="h-64 flex flex-col justify-center items-center space-y-2 text-zinc-400">
          <div className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-800 rounded-full animate-spin" />
          <span className="text-xs font-mono">Fetching dashboard metrics...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-start">
          <div className="lg:col-span-8 flex flex-col gap-4 lg:gap-5 min-w-0">
            {org && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`${bentoCard} flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4`}
              >
                <div className="space-y-1 min-w-0">
                  <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">
                    Organisation
                  </p>
                  <h1 className="text-xl sm:text-2xl font-bold font-mono text-zinc-950 uppercase tracking-tight truncate">
                    {org.name}
                  </h1>
                  <p className="text-xs text-zinc-500 font-mono">
                    {org.slug} · {org.status.toUpperCase()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-mono w-full sm:w-auto">
                  <Link
                    href="/admin/organisation"
                    className="flex-1 sm:flex-none bg-zinc-900 text-white rounded-lg px-3 py-2 text-center min-w-[120px] hover:bg-zinc-800 transition-colors inline-flex items-center justify-center gap-1.5"
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    Manage org
                  </Link>
                  <div className="flex-1 sm:flex-none bg-zinc-50 border border-zinc-100 rounded-lg px-3 py-2 text-center min-w-[100px]">
                    <span className="block text-[9px] text-zinc-400 uppercase">Plan</span>
                    <strong className="text-zinc-800 uppercase">{org.subscriptionPlan}</strong>
                  </div>
                </div>
              </motion.div>
            )}

            {onboarding && !onboarding.readyForEvents && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className={`${bentoCard} border-amber-200 bg-amber-50/30`}
              >
                <div className="flex flex-col sm:flex-row justify-between items-start gap-3 mb-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-mono font-bold uppercase text-zinc-950">Setup checklist</h3>
                    <p className="text-xs text-zinc-500">Complete onboarding before deploying events.</p>
                  </div>
                  <Link
                    href="/admin/onboarding"
                    className="text-xs font-mono font-bold bg-zinc-900 text-white px-3 py-1.5 rounded-lg shrink-0"
                  >
                    Continue setup
                  </Link>
                </div>
                <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-[10px] font-mono">
                  <li className={onboarding.profileComplete ? 'text-green-700' : 'text-zinc-400'}>
                    {onboarding.profileComplete ? '✓' : '○'} Profile ({onboarding.profilePercent}%)
                  </li>
                  <li className={onboarding.kycSubmitted ? 'text-green-700' : 'text-zinc-400'}>
                    {onboarding.kycSubmitted ? '✓' : '○'} KYC submitted
                  </li>
                  <li className={onboarding.kycVerified ? 'text-green-700' : 'text-zinc-400'}>
                    {onboarding.kycVerified ? '✓' : '○'} KYC verified
                  </li>
                  <li className={onboarding.walletConfirmed ? 'text-green-700' : 'text-zinc-400'}>
                    {onboarding.walletConfirmed ? '✓' : '○'} Wallet
                  </li>
                  <li className={onboarding.teamInvited ? 'text-green-700' : 'text-zinc-400'}>
                    {onboarding.teamInvited ? '✓' : '○'} Team invited
                  </li>
                </ul>
              </motion.div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={bentoCard}>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  Events
                </span>
                <p className="mt-3 text-3xl font-bold font-mono text-zinc-950">{events.length}</p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className={bentoCard}
              >
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  Sold
                </span>
                <p className="mt-3 text-3xl font-bold font-mono text-zinc-950">{totalSold}</p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className={bentoCard}
              >
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5" />
                  Check-in
                </span>
                <p className="mt-3 text-3xl font-bold font-mono text-zinc-950">{totalCheckedIn}</p>
                <p className="text-[10px] text-zinc-400 font-mono mt-1">{checkInRate}</p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 }}
                className={`${bentoCard} group`}
              >
                <Link href="/admin/organisation?tab=finance" className="flex flex-col h-full justify-between gap-3">
                  <Wallet className="w-4 h-4 text-zinc-400 group-hover:text-zinc-700 transition-colors" />
                  <div>
                    <p className="text-xs font-mono font-bold text-zinc-950">Finance</p>
                    <p className="text-[10px] font-mono text-zinc-400">Revenue & payouts</p>
                  </div>
                </Link>
              </motion.div>
            </div>

            <AdminEventsExpandable events={events} />
          </div>

          <motion.aside
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`${bentoCard} lg:col-span-4 lg:sticky lg:top-6 lg:self-start flex flex-col gap-4`}
          >
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-zinc-100 border border-zinc-200 flex items-center justify-center">
                <Mail className="w-4 h-4 text-zinc-600" />
              </div>
              <div>
                <h3 className="text-sm font-mono font-bold uppercase tracking-tight text-zinc-950">Invites</h3>
                <p className="text-[10px] font-mono text-zinc-400">Join organisations</p>
              </div>
            </div>

            {pendingInvites.length > 0 ? (
              <ul className="space-y-2 max-h-48 overflow-y-auto">
                {pendingInvites.map((invite) => (
                  <li key={invite.id} className="rounded-lg border border-zinc-100 bg-zinc-50 p-3 space-y-2">
                    <p className="text-xs font-mono font-bold text-zinc-950 truncate">{invite.orgName}</p>
                    <p className="text-[10px] font-mono text-zinc-500">{roleLabel(invite.roleToAssign)}</p>
                    <button
                      type="button"
                      disabled={acceptingInvite}
                      onClick={() => void processAcceptInvite(invite.inviteToken)}
                      className="w-full px-3 py-1.5 bg-zinc-900 text-white rounded-md text-[10px] font-mono font-bold uppercase disabled:opacity-50"
                    >
                      Accept
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs font-mono text-zinc-500 bg-zinc-50 border border-zinc-100 rounded-lg p-3">
                No pending invites.
              </p>
            )}

            <form onSubmit={(e) => void handleAcceptInvite(e)} className="space-y-2 border-t border-zinc-100 pt-4">
              <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">
                Invite token
              </label>
              <input
                type="text"
                value={inviteToken}
                onChange={(e) => setInviteToken(e.target.value)}
                placeholder="Paste token"
                className="w-full px-3 py-2 border border-zinc-200 rounded-lg bg-zinc-50 font-mono text-xs focus:outline-none focus:border-zinc-400"
              />
              <button
                type="submit"
                disabled={acceptingInvite || !inviteToken.trim()}
                className="w-full px-3 py-2 bg-zinc-900 text-white rounded-lg text-xs font-mono font-bold uppercase disabled:opacity-40"
              >
                {acceptingInvite ? 'Accepting…' : 'Accept'}
              </button>
            </form>

            {inviteError && (
              <p className="text-[10px] font-mono text-red-700 bg-red-50 border border-red-100 p-2 rounded-lg">
                {inviteError}
              </p>
            )}
            {inviteSuccessMsg && (
              <p className="text-[10px] font-mono text-green-800 bg-green-50 border border-green-100 p-2 rounded-lg">
                {inviteSuccessMsg}
              </p>
            )}
          </motion.aside>
        </div>
      )}
    </AdminPageShell>
  );
}
