'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Coins,
  Award,
  Gift,
  Copy,
  Check,
  Share2,
  Calendar,
  AlertCircle,
  ArrowRight,
  Settings,
  LogOut,
  Loader2,
  Pencil,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  getMe,
  getWalletBalance,
  listMyRewards,
  getReferralStats,
  updateProfile,
  logoutSession,
  requestFaucetFunds,
  type AuthUser,
  type LoyaltyReward,
  type ReferralStats,
  type WalletInfo,
} from '@/lib/api';
import Navbar from '@/components/layout/Navbar';
import { ContractExplorerLink } from '@/components/blockchain/ContractExplorerLink';
import { WalletConnectModal } from '@/components/WalletConnectModal';
import { MetaMaskIcon } from '@/components/wallet/MetaMaskIcon';
import { formatWeiToTmstc } from '@/lib/blockchain';
import { fetchExternalBalanceWei, getStoredWallet, type ConnectedExternalWallet } from '@/lib/wallet';

function getRoleName(role: number) {
  switch (role) {
    case 99:
      return 'Platform Admin';
    case 3:
      return 'Super Admin';
    case 2:
      return 'Admin';
    case 1:
      return 'Volunteer';
    default:
      return 'Consumer';
  }
}

function getRoleBadgeClass(role: number) {
  switch (role) {
    case 99:
      return 'bg-violet-100 text-violet-900 border-violet-200';
    case 3:
      return 'bg-amber-100 text-amber-900 border-amber-200';
    case 2:
      return 'bg-blue-100 text-blue-900 border-blue-200';
    case 1:
      return 'bg-emerald-100 text-emerald-900 border-emerald-200';
    default:
      return 'bg-zinc-100 text-zinc-700 border-zinc-200';
  }
}

function getDisplayName(user: AuthUser) {
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  if (full) return full;
  return user.email.split('@')[0];
}

function getInitials(user: AuthUser) {
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  if (full) {
    const parts = full.split(/\s+/);
    return parts
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('');
  }
  return user.email[0]?.toUpperCase() ?? '?';
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [rewards, setRewards] = useState<LoyaltyReward[]>([]);
  const [referral, setReferral] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [bio, setBio] = useState('');
  const [bioDraft, setBioDraft] = useState('');
  const [editingBio, setEditingBio] = useState(false);
  const [savingBio, setSavingBio] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [bioError, setBioError] = useState<string | null>(null);
  const [externalWallet, setExternalWallet] = useState<ConnectedExternalWallet | null>(null);
  const [externalBalanceWei, setExternalBalanceWei] = useState<string | null>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [walletConnectRequired, setWalletConnectRequired] = useState(false);

  const requiresBrowserWallet = user !== null && user.role !== 99;
  const walletModalOpen =
    showWalletModal || (walletConnectRequired && requiresBrowserWallet && !externalWallet);

  // Faucet request states
  const [requestingPlatformFaucet, setRequestingPlatformFaucet] = useState(false);
  const [faucetMessage, setFaucetMessage] = useState<string | null>(null);
  const [faucetErr, setFaucetErr] = useState<string | null>(null);
  const [walletAddressCopied, setWalletAddressCopied] = useState(false);
  const [externalWalletAddressCopied, setExternalWalletAddressCopied] = useState(false);
  const [faucetCopyNotice, setFaucetCopyNotice] = useState<{
    message: string;
    error: boolean;
  } | null>(null);

  const copyFaucetWalletAddress = async () => {
    const address = externalWallet?.address ?? user?.walletAddress;
    if (!address) {
      setFaucetCopyNotice({ message: 'Connect a wallet before using the faucet.', error: true });
      setTimeout(() => setFaucetCopyNotice(null), 3000);
      return;
    }

    try {
      await navigator.clipboard.writeText(address);
      setFaucetCopyNotice({
        message: 'Wallet address copied. Paste it into the MST faucet.',
        error: false,
      });
    } catch {
      setFaucetCopyNotice({
        message: 'Could not copy automatically. Copy the wallet address shown above.',
        error: true,
      });
    }
    setTimeout(() => setFaucetCopyNotice(null), 3000);
  };

  const handleRequestPlatformFaucet = async () => {
    if (!user?.walletAddress) return;
    setRequestingPlatformFaucet(true);
    setFaucetMessage(null);
    setFaucetErr(null);
    try {
      const res = await requestFaucetFunds(user.walletAddress);
      if (res.mode === 'in_app') {
        setFaucetMessage(`Successfully requested tMSTC! Tx Hash: ${res.txHash || 'completed'}`);
      } else {
        setFaucetMessage(res.message || 'Directing to faucet website...');
        void copyFaucetWalletAddress();
        window.open(res.externalUrl, '_blank', 'noopener,noreferrer');
      }
      // update balance
      const walletData = await getWalletBalance().catch(() => null);
      setWallet(walletData);
    } catch (err) {
      setFaucetErr(err instanceof Error ? err.message : 'Faucet request failed');
    } finally {
      setRequestingPlatformFaucet(false);
    }
  };

  const handleGoToExternalFaucet = () => {
    window.open('https://faucet.mstblockchain.com/', '_blank', 'noopener,noreferrer');
    void copyFaucetWalletAddress();
  };


  const inputClass =
    'w-full bg-zinc-50 border border-zinc-200 rounded px-3 py-2 text-xs font-mono text-zinc-900 focus:outline-none focus:border-zinc-400';
  const labelClass = 'text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400';

  const isMetaMaskConnected = externalWallet?.provider === 'metamask';

  const displayName = useMemo(() => (user ? getDisplayName(user) : ''), [user]);
  const initials = useMemo(() => (user ? getInitials(user) : ''), [user]);

  useEffect(() => {
    void (async () => {
      try {
        const currentUser = await getMe();
        if (currentUser) {
          setUser(currentUser);
          setFirstName(currentUser.firstName ?? '');
          setLastName(currentUser.lastName ?? '');
          setPhoneNumber(currentUser.phoneNumber ?? '');
          setBio(currentUser.bio ?? '');
          setBioDraft(currentUser.bio ?? '');
          const [rewardsData, refData, walletData] = await Promise.all([
            listMyRewards().catch(() => [] as LoyaltyReward[]),
            getReferralStats().catch(() => null),
            getWalletBalance().catch(() => null),
          ]);
          setRewards(rewardsData);
          setReferral(refData);
          setWallet(walletData);
          const stored = getStoredWallet();
          setExternalWallet(stored);
          if (stored) {
            fetchExternalBalanceWei(stored.address)
              .then(setExternalBalanceWei)
              .catch(() => setExternalBalanceWei(null));
          } else if (currentUser.role !== 99) {
            setWalletConnectRequired(true);
          }
        }
      } catch (err) {
        console.error('Failed to load profile data', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleCopyLink = () => {
    if (!referral) return;
    const link = `${window.location.origin}/events?ref=${referral.referralCode}`;
    void navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || user.role === 99) return;
    setSaving(true);
    setSettingsError(null);
    setSaved(false);
    try {
      const updated = await updateProfile({ firstName, lastName, phoneNumber });
      setUser((prev) => (prev ? { ...prev, ...updated } : prev));
      setSaved(true);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBio = async () => {
    if (!user || user.role === 99) return;
    setSavingBio(true);
    setBioError(null);
    try {
      const updated = await updateProfile({ bio: bioDraft });
      setBio(updated.bio ?? '');
      setBioDraft(updated.bio ?? '');
      setUser((prev) => (prev ? { ...prev, bio: updated.bio } : prev));
      setEditingBio(false);
    } catch (err) {
      setBioError(err instanceof Error ? err.message : 'Failed to save bio');
    } finally {
      setSavingBio(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logoutSession();
    } catch {
      // ignore
    }
    router.push('/login');
  };

  return (
    <>
      <Navbar />
      <div className="bg-zinc-50 min-h-[calc(100vh-4rem)] pb-16">
        <main className="max-w-4xl mx-auto px-4 py-8">
          {loading ? (
            <div className="h-64 flex flex-col justify-center items-center space-y-2 text-zinc-400">
              <div className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-800 rounded-full animate-spin" />
              <span className="text-xs font-mono">Fetching profile...</span>
            </div>
          ) : !user ? (
            <div className="bg-white border border-zinc-200 rounded-xl p-12 text-center max-w-md mx-auto space-y-4">
              <AlertCircle className="w-8 h-8 mx-auto text-zinc-400" />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-zinc-950">Authentication Required</h3>
                <p className="text-xs text-zinc-500">
                  Please sign in to access your dashboard and rewards wallet.
                </p>
              </div>
              <Link
                href="/login"
                className="inline-flex items-center space-x-1.5 px-4 py-2 bg-zinc-900 text-white rounded text-xs font-mono font-bold uppercase tracking-wider hover:bg-zinc-800 transition-colors"
              >
                <span>Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Profile identity */}
              <motion.section
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-zinc-200 rounded-xl overflow-hidden"
              >
                <div className="px-6 py-8 sm:px-10 flex flex-col items-center text-center gap-4">
                  <div className="relative">
                    {user.profileImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={user.profileImage}
                        alt={displayName}
                        className="w-24 h-24 rounded-full object-cover border-2 border-white shadow-md ring-2 ring-zinc-100"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-full bg-gradient-to-br from-zinc-100 to-zinc-200 border-2 border-white shadow-md ring-2 ring-zinc-100 flex items-center justify-center text-2xl font-bold font-mono text-zinc-600">
                        {initials}
                      </div>
                    )}
                    {isMetaMaskConnected && (
                      <div
                        className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-orange-500 border-2 border-white flex items-center justify-center shadow-lg ring-2 ring-orange-300"
                        title="MetaMask connected"
                      >
                        <MetaMaskIcon className="w-5 h-5" />
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <h1 className="text-xl sm:text-2xl font-semibold text-zinc-950 tracking-tight">
                      {displayName}
                    </h1>
                    <p className="text-xs text-zinc-400 font-mono">{user.email}</p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <span
                      className={`px-3 py-1 rounded-full text-[11px] font-bold font-mono uppercase tracking-wide border ${getRoleBadgeClass(user.role)}`}
                    >
                      {getRoleName(user.role)}
                    </span>
                    {isMetaMaskConnected && (
                      <span className="px-3 py-1 rounded-full text-[11px] font-bold font-mono uppercase tracking-wide border border-orange-300 bg-orange-50 text-orange-800 flex items-center gap-1.5 ring-2 ring-orange-200 shadow-sm">
                        <MetaMaskIcon className="w-3.5 h-3.5" />
                        MetaMask
                      </span>
                    )}
                    {externalWallet && externalWallet.provider === 'phantom' && (
                      <span className="px-3 py-1 rounded-full text-[11px] font-bold font-mono uppercase tracking-wide border border-purple-200 bg-purple-50 text-purple-800">
                        Phantom
                      </span>
                    )}
                  </div>

                  <div className="w-full max-w-lg">
                    {editingBio && user.role !== 99 ? (
                      <div className="space-y-2 text-left">
                        <textarea
                          value={bioDraft}
                          onChange={(e) => setBioDraft(e.target.value)}
                          rows={3}
                          maxLength={500}
                          placeholder="Tell others a bit about yourself..."
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-700 resize-none focus:outline-none focus:border-zinc-400"
                        />
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-mono text-zinc-400">{bioDraft.length}/500</span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setBioDraft(bio);
                                setEditingBio(false);
                                setBioError(null);
                              }}
                              className="px-3 py-1.5 text-xs font-mono border border-zinc-200 rounded-md hover:bg-zinc-50"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={savingBio}
                              onClick={() => void handleSaveBio()}
                              className="px-3 py-1.5 text-xs font-mono font-bold bg-zinc-900 text-white rounded-md hover:bg-zinc-800 disabled:opacity-50 flex items-center gap-1.5"
                            >
                              {savingBio && <Loader2 className="w-3 h-3 animate-spin" />}
                              Save
                            </button>
                          </div>
                        </div>
                        {bioError && <p className="text-xs text-red-600 font-mono">{bioError}</p>}
                      </div>
                    ) : (
                      <div className="group relative inline-flex items-start justify-center gap-2 max-w-full">
                        <p className="text-sm text-zinc-600 leading-relaxed">
                          {bio || 'Add a short bio about yourself and your events.'}
                        </p>
                        {user.role !== 99 && (
                          <button
                            type="button"
                            onClick={() => {
                              setBioDraft(bio);
                              setEditingBio(true);
                            }}
                            className="shrink-0 p-1 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 opacity-70 group-hover:opacity-100 transition-opacity"
                            aria-label="Edit bio"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleLogout()}
                    className="inline-flex items-center gap-2 px-4 py-2 border border-zinc-200 text-zinc-500 rounded-md text-xs font-mono font-bold hover:bg-zinc-50 hover:text-zinc-700 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Log out
                  </button>
                </div>
              </motion.section>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-1 space-y-6">
                  {user.role !== 99 && (
                    <form
                      onSubmit={(e) => void handleSaveSettings(e)}
                      className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4"
                    >
                      <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center space-x-1.5">
                        <Settings className="w-4 h-4" />
                        <span>Account settings</span>
                      </h3>

                      <div className="space-y-1">
                        <label className={labelClass}>Email</label>
                        <input className={`${inputClass} opacity-60`} value={user.email} readOnly />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className={labelClass}>First name</label>
                          <input
                            className={inputClass}
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className={labelClass}>Last name</label>
                          <input
                            className={inputClass}
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className={labelClass}>Phone number</label>
                        <input
                          className={inputClass}
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          placeholder="+919876543210"
                        />
                      </div>

                      {settingsError && <p className="text-xs text-red-600 font-mono">{settingsError}</p>}
                      {saved && <p className="text-xs text-green-700 font-mono">Settings saved.</p>}

                      <button
                        type="submit"
                        disabled={saving}
                        className="w-full bg-zinc-900 text-white py-2 rounded text-xs font-mono font-bold disabled:opacity-40 flex items-center justify-center gap-2"
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save settings'}
                      </button>
                    </form>
                  )}

                  <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
                    <div className="space-y-3">
                      <div className="space-y-1 rounded-lg border border-zinc-100 bg-zinc-50 p-3">
                        <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400 flex items-center gap-1">
                          <Coins className="w-3 h-3" />
                          Wallet balance
                        </span>
                        <p className="text-lg font-bold font-mono text-zinc-950">
                          {wallet ? `${formatWeiToTmstc(wallet.balanceWei)} ${wallet.symbol}` : '—'}
                        </p>
                        <p className="text-[10px] font-mono text-zinc-400">
                          MST Chain ID {wallet?.chainId ?? process.env.NEXT_PUBLIC_MST_CHAIN_ID ?? '—'}
                        </p>
                      </div>

                      <div className="space-y-2 rounded-lg border border-zinc-100 bg-zinc-50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400 flex items-center gap-1.5">
                            {isMetaMaskConnected && <MetaMaskIcon className="w-3 h-3" />}
                            Extension wallet
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowWalletModal(true)}
                            className="text-[10px] font-mono font-bold uppercase text-zinc-900 hover:underline"
                          >
                            {externalWallet ? 'Change' : 'Connect'}
                          </button>
                        </div>
                        {externalWallet ? (
                          <>
                            <p className="text-[10px] font-mono text-zinc-500 uppercase">
                              {externalWallet.provider}
                            </p>
                            <div className="flex items-center gap-2">
                              <p className="min-w-0 flex-1 text-xs font-mono text-zinc-700 break-all">
                                {externalWallet.address}
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  void navigator.clipboard.writeText(externalWallet.address);
                                  setExternalWalletAddressCopied(true);
                                  setTimeout(() => setExternalWalletAddressCopied(false), 2000);
                                }}
                                className="p-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded flex items-center justify-center transition-colors shrink-0"
                                title={`Copy ${externalWallet.provider} wallet address`}
                                aria-label={`Copy ${externalWallet.provider} wallet address`}
                              >
                                {externalWalletAddressCopied ? (
                                  <Check className="w-3.5 h-3.5" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                            {externalBalanceWei !== null && (
                              <p className="text-sm font-bold font-mono text-zinc-950">
                                {formatWeiToTmstc(externalBalanceWei)} tMSTC
                              </p>
                            )}
                            <ContractExplorerLink
                              value={externalWallet.address}
                              type="address"
                              className="text-[10px]"
                            />
                          </>
                        ) : (
                          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-md p-2">
                            <strong className="font-semibold">Required:</strong> connect MetaMask or
                            Phantom to receive NFT tickets and use the MST testnet faucet.
                          </p>
                        )}
                      </div>

                      {!externalWallet && (
                        <div className="space-y-1.5">
                          <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400">
                            Ticket wallet (on file)
                          </span>
                          <div className="flex gap-2">
                            <p className="flex-1 text-xs font-mono text-zinc-700 break-all bg-zinc-50 border border-zinc-100 rounded p-2 select-all truncate">
                              {user.walletAddress}
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                void navigator.clipboard.writeText(user.walletAddress);
                                setWalletAddressCopied(true);
                                setTimeout(() => setWalletAddressCopied(false), 2000);
                              }}
                              className="px-3 bg-zinc-900 hover:bg-zinc-800 text-white rounded flex items-center justify-center transition-colors shrink-0"
                              title="Copy Wallet Address"
                            >
                              {walletAddressCopied ? (
                                <Check className="w-3.5 h-3.5" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                          <p className="text-[10px] text-zinc-400 font-mono">
                            Minted tickets go here. Connect MetaMask above to switch.
                          </p>
                          <ContractExplorerLink
                            value={user.walletAddress}
                            type="address"
                            className="text-[10px]"
                          />
                        </div>
                      )}

                      {/* MST Blockchain Faucet Widget */}
                      <div className="border-t border-zinc-150 pt-4 space-y-3">
                        <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400">
                          MST TESTNET FAUCET
                        </span>
                        
                        <p className="text-[11px] text-zinc-500 leading-relaxed font-body">
                          Need native gas tokens (tMSTC) to purchase tickets or pay transactions? Get some instantly.
                        </p>

                        <div className="flex flex-col gap-2">
                          <button
                            type="button"
                            disabled={requestingPlatformFaucet || !user.walletAddress}
                            onClick={handleRequestPlatformFaucet}
                            className="w-full py-2 bg-zinc-950 text-white rounded hover:bg-zinc-800 text-xs font-mono font-bold transition-all disabled:opacity-40"
                          >
                            {requestingPlatformFaucet ? 'Transferring tMSTC...' : 'Request tMSTC from Platform'}
                          </button>

                          <button
                            type="button"
                            onClick={handleGoToExternalFaucet}
                            className="w-full py-2 border border-zinc-300 text-zinc-800 hover:bg-zinc-50 rounded text-xs font-mono font-bold text-center block transition-all"
                          >
                            Go to External Faucet website ↗
                          </button>
                        </div>

                        {faucetMessage && (
                          <p className="text-[10px] font-mono text-green-700 bg-green-50 border border-green-100 rounded p-2">
                            {faucetMessage}
                          </p>
                        )}

                        {faucetErr && (
                          <p className="text-[10px] font-mono text-red-700 bg-red-50 border border-red-100 rounded p-2">
                            {faucetErr}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center space-x-1.5">
                      <Share2 className="w-4 h-4" />
                      <span>Referrals</span>
                    </h3>

                    {referral ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4 text-xs font-mono border-b border-zinc-100 pb-3">
                          <div className="space-y-0.5">
                            <span className="text-[10px] text-zinc-400">TOTAL SIGNUPS</span>
                            <p className="font-bold text-zinc-900">{referral.referralsCount}</p>
                          </div>
                          <div className="space-y-0.5 text-right">
                            <span className="text-[10px] text-zinc-400">REWARDS EARNED</span>
                            <p className="font-bold text-zinc-900">{referral.rewardsCount}</p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400">
                            Your Invite Link
                          </span>
                          <div className="flex space-x-1">
                            <input
                              type="text"
                              readOnly
                              value={`${window.location.origin}/events?ref=${referral.referralCode}`}
                              className="flex-1 bg-zinc-50 border border-zinc-200 px-2.5 py-1 rounded text-xs font-mono select-all text-zinc-600 truncate focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={handleCopyLink}
                              className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-white rounded flex items-center justify-center transition-colors"
                            >
                              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs font-mono text-zinc-400 border border-dashed border-zinc-200 p-4 text-center rounded-lg">
                        Referral stats unavailable.
                      </div>
                    )}
                  </div>
                </div>

                <div className="md:col-span-2 space-y-6">
                  <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-6">
                    <div className="flex justify-between items-center border-b border-zinc-100 pb-4">
                      <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center space-x-1.5">
                        <Award className="w-4 h-4" />
                        <span>Post-event collectibles gallery</span>
                      </h2>
                      <span className="text-xs text-zinc-500 font-mono font-semibold">
                        {rewards.length} Collected
                      </span>
                    </div>

                    {rewards.length === 0 ? (
                      <div className="py-12 text-center space-y-3">
                        <Gift className="w-8 h-8 text-zinc-200 mx-auto" />
                        <div className="space-y-1">
                          <h4 className="text-xs font-mono font-bold uppercase text-zinc-500">
                            Loyalty list empty
                          </h4>
                          <p className="text-[11px] text-zinc-400 max-w-xs mx-auto">
                            Check in to events at the gate to earn digital attendance collectables and future
                            ticket discount tokens.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {rewards.map((reward) => (
                          <div
                            key={reward.id}
                            className="border border-zinc-200 hover:border-zinc-400 rounded-lg p-4 flex items-start space-x-3 transition-colors bg-white"
                          >
                            <div className="p-2 bg-zinc-50 rounded border border-zinc-100 text-zinc-800 mt-0.5">
                              {reward.rewardType === 'attendance_badge' ? (
                                <Award className="w-4 h-4" />
                              ) : (
                                <Gift className="w-4 h-4" />
                              )}
                            </div>
                            <div className="space-y-1.5 flex-1 min-w-0">
                              <h4 className="font-bold font-mono text-zinc-950 uppercase text-xs truncate">
                                {reward.rewardMetadata?.badge_name ?? reward.rewardType.replace('_', ' ')}
                              </h4>
                              <div className="space-y-0.5 text-[10px] text-zinc-400 font-mono">
                                {reward.rewardMetadata?.event_date && (
                                  <p className="flex items-center space-x-1">
                                    <Calendar className="w-3 h-3 text-zinc-300" />
                                    <span>{reward.rewardMetadata.event_date}</span>
                                  </p>
                                )}
                                {reward.rewardMetadata?.tier && <p>Tier: {reward.rewardMetadata.tier}</p>}
                                {reward.tokenId !== null && (
                                  <p className="truncate">NFT ID: #{reward.tokenId}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      <WalletConnectModal
        open={walletModalOpen}
        required={walletConnectRequired && !externalWallet}
        allowSkip={!walletConnectRequired || externalWallet !== null}
        linkToAccount
        title={
          walletConnectRequired && !externalWallet
            ? 'Connect your wallet to continue'
            : 'Connect your browser wallet'
        }
        onClose={() => {
          if (walletConnectRequired && !externalWallet) return;
          setShowWalletModal(false);
        }}
        onComplete={(w) => {
          setShowWalletModal(false);
          if (w) {
            setWalletConnectRequired(false);
            setExternalWallet(w);
            void fetchExternalBalanceWei(w.address).then(setExternalBalanceWei);
            void getWalletBalance().then(setWallet).catch(() => null);
            void getMe().then((me) => me && setUser(me)).catch(() => null);
          }
        }}
      />
      {faucetCopyNotice && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-5 right-5 z-[70] flex max-w-sm items-center gap-2 rounded-lg border px-4 py-3 text-xs font-mono shadow-lg ${
            faucetCopyNotice.error
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-green-200 bg-green-50 text-green-800'
          }`}
        >
          {faucetCopyNotice.error ? (
            <AlertCircle className="h-4 w-4 shrink-0" />
          ) : (
            <Check className="h-4 w-4 shrink-0" />
          )}
          <span>{faucetCopyNotice.message}</span>
        </div>
      )}
    </>
  );
}
