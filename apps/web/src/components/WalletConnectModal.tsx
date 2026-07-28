'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, Droplets, Loader2, RefreshCw, Unplug, Wallet, X } from 'lucide-react';
import { requestFaucetFunds, linkWalletToAccount } from '@/lib/api';
import { formatWeiToTmstc } from '@/lib/blockchain';
import {
  clearStoredWallet,
  connectExternalWallet,
  fetchExternalBalanceWei,
  getStoredWallet,
  isMetaMaskAvailable,
  isPhantomAvailable,
  type ConnectedExternalWallet,
  type WalletProviderId,
} from '@/lib/wallet';
import { ContractExplorerLink } from '@/components/blockchain/ContractExplorerLink';

interface WalletConnectModalProps {
  open: boolean;
  onClose: () => void;
  onComplete?: (wallet: ConnectedExternalWallet | null) => void;
  allowSkip?: boolean;
  /** When true, user must connect before the modal can close */
  required?: boolean;
  linkToAccount?: boolean;
  title?: string;
}

export function WalletConnectModal({
  open,
  onClose,
  onComplete,
  allowSkip = true,
  required = false,
  linkToAccount = true,
  title = 'Connect your browser wallet',
}: WalletConnectModalProps) {
  const [connected, setConnected] = useState<ConnectedExternalWallet | null>(null);
  const [lastUsed, setLastUsed] = useState<ConnectedExternalWallet | null>(null);
  const [balanceWei, setBalanceWei] = useState<string | null>(null);
  const [loading, setLoading] = useState<WalletProviderId | 'faucet' | 'switch' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [faucetMsg, setFaucetMsg] = useState<string | null>(null);

  const refreshBalance = useCallback(async (address: string) => {
    const bal = await fetchExternalBalanceWei(address);
    setBalanceWei(bal);
  }, []);

  const resetPicker = useCallback(() => {
    setConnected(null);
    setBalanceWei(null);
    setError(null);
    setFaucetMsg(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    // Always start on wallet picker — do not auto-skip to "Connected"
    resetPicker();
    setLastUsed(getStoredWallet());
  }, [open, resetPicker]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const linkWallet = async (wallet: ConnectedExternalWallet) => {
    if (!linkToAccount) return;
    try {
      await linkWalletToAccount(wallet.address);
      setFaucetMsg('Browser wallet linked to your account. Tickets will mint here.');
    } catch (linkErr) {
      setFaucetMsg(
        linkErr instanceof Error && linkErr.message.includes('Authentication')
          ? 'Wallet connected. Sign in, then connect again to link it to your account.'
          : linkErr instanceof Error
            ? linkErr.message
            : 'Could not link wallet to account'
      );
    }
  };

  const handleConnect = async (provider: WalletProviderId, requestPermission = true) => {
    setLoading(provider);
    setError(null);
    setFaucetMsg(null);
    try {
      const wallet = await connectExternalWallet(provider, { requestPermission });
      setConnected(wallet);
      setLastUsed(wallet);
      await refreshBalance(wallet.address);
      await linkWallet(wallet);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wallet connection failed');
    } finally {
      setLoading(null);
    }
  };

  const handleSwitchAccount = async () => {
    if (!connected) return;
    setLoading('switch');
    setError(null);
    try {
      const wallet = await connectExternalWallet(connected.provider, { requestPermission: true });
      setConnected(wallet);
      setLastUsed(wallet);
      await refreshBalance(wallet.address);
      await linkWallet(wallet);
      setFaucetMsg('Account updated from your wallet.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not switch account');
    } finally {
      setLoading(null);
    }
  };

  const handleDisconnect = () => {
    clearStoredWallet();
    resetPicker();
    setLastUsed(null);
    setFaucetMsg('Disconnected. Choose a wallet to connect again.');
  };

  const handleFaucet = async () => {
    if (!connected) return;
    setLoading('faucet');
    setError(null);
    setFaucetMsg(null);
    try {
      const result = await requestFaucetFunds(connected.address);
      if (result.mode === 'in_app') {
        setFaucetMsg(`Sent ${formatWeiToTmstc(result.amountWei)} tMSTC to your wallet.`);
        setBalanceWei(result.balanceWei);
      } else {
        window.open(result.externalUrl, '_blank', 'noopener,noreferrer');
        setFaucetMsg('Opened MST testnet faucet in a new tab.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Faucet request failed');
    } finally {
      setLoading(null);
    }
  };

  const finish = (wallet: ConnectedExternalWallet | null) => {
    if (required && !wallet) return;
    onComplete?.(wallet);
    onClose();
  };

  const canDismiss = !required || connected !== null;

  if (!open) return null;

  const metaMaskOk = isMetaMaskAvailable();
  const phantomOk = isPhantomAvailable();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close wallet connect"
        className="absolute inset-0 bg-zinc-950/50 backdrop-blur-sm"
        onClick={() => canDismiss && finish(connected)}
      />
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md bg-white border border-zinc-200 rounded-xl shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-zinc-600" />
            <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
          </div>
          {canDismiss && (
            <button
              type="button"
              onClick={() => finish(connected)}
              className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-900"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="p-5 space-y-4">
          {!connected ? (
            <>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Click MetaMask or Phantom — your extension should open to <strong>approve</strong> or{' '}
                <strong>pick an account</strong>. MST Testnet is added after you connect.
              </p>

              {lastUsed && (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 space-y-2">
                  <p className="text-[10px] font-mono uppercase text-zinc-400">Last session</p>
                  <p className="text-xs font-mono text-zinc-700 break-all">{lastUsed.address}</p>
                  <button
                    type="button"
                    disabled={loading !== null}
                    onClick={() => void handleConnect(lastUsed.provider, false)}
                    className="text-xs font-mono font-bold text-zinc-900 underline hover:no-underline disabled:opacity-50"
                  >
                    Reconnect without popup (already approved)
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={!metaMaskOk || loading !== null}
                  onClick={() => void handleConnect('metamask', true)}
                  className="flex flex-col items-center gap-2 p-4 border border-zinc-200 rounded-lg hover:border-zinc-400 hover:bg-zinc-50 disabled:opacity-40 transition-colors"
                >
                  {loading === 'metamask' ? (
                    <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
                  ) : (
                    <span className="text-2xl" aria-hidden>
                      🦊
                    </span>
                  )}
                  <span className="text-sm font-medium text-zinc-900">MetaMask</span>
                  <span className="text-[10px] text-zinc-400 text-center">Opens extension to approve</span>
                </button>
                <button
                  type="button"
                  disabled={!phantomOk || loading !== null}
                  onClick={() => void handleConnect('phantom', true)}
                  className="flex flex-col items-center gap-2 p-4 border border-zinc-200 rounded-lg hover:border-zinc-400 hover:bg-zinc-50 disabled:opacity-40 transition-colors"
                >
                  {loading === 'phantom' ? (
                    <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
                  ) : (
                    <span className="text-2xl" aria-hidden>
                      👻
                    </span>
                  )}
                  <span className="text-sm font-medium text-zinc-900">Phantom</span>
                  <span className="text-[10px] text-zinc-400 text-center">EVM mode required</span>
                </button>
              </div>
            </>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={connected.address}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-3 rounded-lg border border-zinc-100 bg-zinc-50 p-4"
              >
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-zinc-500 uppercase">{connected.provider}</span>
                  <span className="text-green-700 font-medium">Connected</span>
                </div>
                <p className="text-xs font-mono text-zinc-800 break-all">{connected.address}</p>
                <ContractExplorerLink value={connected.address} type="address" className="text-[10px]" />
                {balanceWei !== null && (
                  <p className="text-sm font-mono font-semibold text-zinc-950">
                    {formatWeiToTmstc(balanceWei)} tMSTC
                  </p>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    disabled={loading !== null}
                    onClick={() => void handleSwitchAccount()}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-200 rounded-md text-[10px] font-mono font-bold uppercase hover:bg-white disabled:opacity-50"
                  >
                    {loading === 'switch' ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                    Switch account
                  </button>
                  <button
                    type="button"
                    disabled={loading !== null}
                    onClick={handleDisconnect}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-200 rounded-md text-[10px] font-mono font-bold uppercase hover:bg-white disabled:opacity-50"
                  >
                    <Unplug className="w-3 h-3" />
                    Disconnect
                  </button>
                </div>

                <button
                  type="button"
                  disabled={loading === 'faucet'}
                  onClick={() => void handleFaucet()}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-zinc-900 text-white rounded-md text-xs font-mono font-bold uppercase hover:bg-zinc-800 disabled:opacity-50"
                >
                  {loading === 'faucet' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Droplets className="w-3.5 h-3.5" />
                  )}
                  Get test tMSTC
                </button>
              </motion.div>
            </AnimatePresence>
          )}

          {error && (
            <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-100 p-3 rounded-md">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {faucetMsg && (
            <p className="text-xs text-green-800 bg-green-50 border border-green-100 p-3 rounded-md">
              {faucetMsg}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            {!required && allowSkip && (
              <button
                type="button"
                onClick={() => finish(connected)}
                className="flex-1 py-2 border border-zinc-200 rounded-md text-sm text-zinc-600 hover:bg-zinc-50"
              >
                {connected ? 'Done' : 'Skip for now'}
              </button>
            )}
            {connected && (
              <button
                type="button"
                onClick={() => finish(connected)}
                className="flex-1 py-2 bg-zinc-900 text-white rounded-md text-sm font-medium hover:bg-zinc-800"
              >
                Continue
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
