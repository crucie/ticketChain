'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Ticket,
  ArrowRight,
  QrCode,
  Download,
  Send,
  Tag,
  AlertCircle,
  X,
  CheckCircle2,
  Clock,
  Loader2,
  Copy,
  Check
} from 'lucide-react';
import {
  getMe,
  listMyTickets,
  getTicketQr,
  transferTicket,
  listTicketForResale,
  cancelResaleListing,
  downloadTicketPdf,
  type TicketSummary
} from '@/lib/api';
import Navbar from '@/components/layout/Navbar';
import { ContractAddressRow, ContractExplorerLink } from '@/components/blockchain/ContractExplorerLink';
import { PublicListToolbar, FilterChip, ClearFiltersButton } from '@/components/public/PublicListToolbar';

type TicketStatusFilter = 'all' | 'valid' | 'used' | 'listed';

function formatCheckinCode(code: string): string {
  const normalized = code.replace(/[\s\-]/g, '').toUpperCase();
  if (normalized.length !== 9) return normalized;
  return `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6, 9)}`;
}

function sortTicketsByRecent(tickets: TicketSummary[]): TicketSummary[] {
  return [...tickets].sort(
    (a, b) => new Date(b.mintedAt).getTime() - new Date(a.mintedAt).getTime()
  );
}

export default function MyTicketsPage() {
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TicketStatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [needsLogin, setNeedsLogin] = useState(false);

  // Selected ticket for modal details
  const [selectedTicket, setSelectedTicket] = useState<TicketSummary | null>(null);
  const [qrPayload, setQrPayload] = useState<string | null>(null);
  const [checkinCode, setCheckinCode] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [qrTimeLeft, setQrTimeLeft] = useState(60);
  const [qrLoading, setQrLoading] = useState(false);

  // Action forms state
  const [recipient, setRecipient] = useState('');
  const [askPrice, setAskPrice] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [transferTxHash, setTransferTxHash] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Poll intervals
  const [timerId, setTimerId] = useState<NodeJS.Timeout | null>(null);

  const fetchTickets = async () => {
    try {
      const me = await getMe();
      if (!me) {
        setNeedsLogin(true);
        setLoading(false);
        return;
      }
      const rows = await listMyTickets();
      setTickets(sortTicketsByRecent(rows));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchTickets();
  }, []);

  // Fetch QR payload
  const fetchQR = async (ticketId: string) => {
    setQrLoading(true);
    try {
      const { payload, expiresIn, checkinCode: code } = await getTicketQr(ticketId);
      setQrPayload(payload);
      setCheckinCode(code ?? null);
      setQrTimeLeft(expiresIn);
    } catch (err) {
      console.error(err);
      setQrPayload(null);
      setCheckinCode(null);
    } finally {
      setQrLoading(false);
    }
  };

  // Timer for QR code rotation
  useEffect(() => {
    if (!selectedTicket) {
      setQrPayload(null);
      setCheckinCode(null);
      setCodeCopied(false);
      if (timerId) clearInterval(timerId);
      return;
    }

    // Initial fetch
    void fetchQR(selectedTicket.id);

    const interval = setInterval(() => {
      setQrTimeLeft((prev) => {
        if (prev <= 1) {
          void fetchQR(selectedTicket.id);
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    setTimerId(interval);

    return () => {
      clearInterval(interval);
    };
  }, [selectedTicket]);

  const handleOpenTicket = (ticket: TicketSummary) => {
    setSelectedTicket(ticket);
    setActionSuccess(null);
    setActionError(null);
    setRecipient('');
    setAskPrice('');
  };

  const handleCloseTicket = () => {
    setSelectedTicket(null);
    setTransferTxHash(null);
    if (timerId) clearInterval(timerId);
  };

  const handleTransfer = async () => {
    if (!selectedTicket || !recipient.trim()) return;
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    setTransferTxHash(null);
    try {
      const result = await transferTicket(selectedTicket.id, recipient.trim());
      setTransferTxHash(result.transactionHash);
      setActionSuccess(
        result.transactionHash
          ? 'Ticket transferred on-chain successfully.'
          : 'Ticket transferred successfully.'
      );
      setTimeout(() => {
        handleCloseTicket();
        void fetchTickets();
      }, 3500);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Transfer failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResell = async () => {
    if (!selectedTicket || !askPrice.trim()) return;
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      // ask price is in MSTC (display unit), converted to wei (10^18)
      const priceWei = (Number(askPrice) * 1e18).toString();
      await listTicketForResale(selectedTicket.id, priceWei);
      setActionSuccess('Ticket listed for resale successfully.');
      setTimeout(() => {
        handleCloseTicket();
        void fetchTickets();
      }, 2000);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Listing failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelResale = async () => {
    if (!selectedTicket) return;
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await cancelResaleListing(selectedTicket.id);
      setActionSuccess('Resale listing cancelled.');
      setTimeout(() => {
        handleCloseTicket();
        void fetchTickets();
      }, 2000);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Cancellation failed');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredTickets = useMemo(() => {
    let result = [...tickets];
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (t) =>
          t.id.toLowerCase().includes(q) ||
          String(t.tokenId).includes(q) ||
          t.contractAddress.toLowerCase().includes(q) ||
          t.eventId.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') {
      if (statusFilter === 'listed') {
        result = result.filter((t) => t.status === 'listed_for_resale');
      } else {
        result = result.filter((t) => t.status === statusFilter);
      }
    }
    return sortTicketsByRecent(result);
  }, [tickets, search, statusFilter]);

  const hasActiveFilters = Boolean(search || statusFilter !== 'all');

  return (
    <>
      <Navbar />
      <div className="bg-zinc-50 min-h-[calc(100vh-4rem)] pb-16">
        <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">
          {!needsLogin && !loading && tickets.length > 0 && (
            <PublicListToolbar
              search={search}
              onSearchChange={setSearch}
              placeholder="Search by token ID, ticket ID, or contract…"
              hasActiveFilters={hasActiveFilters}
              filterPanel={
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 w-full sm:w-auto">
                    Status
                  </span>
                  {(['all', 'valid', 'used', 'listed'] as TicketStatusFilter[]).map((s) => (
                    <FilterChip
                      key={s}
                      active={statusFilter === s}
                      onClick={() => setStatusFilter(s)}
                    >
                      {s === 'all' ? 'All' : s === 'listed' ? 'Listed' : s.charAt(0).toUpperCase() + s.slice(1)}
                    </FilterChip>
                  ))}
                  {hasActiveFilters && (
                    <ClearFiltersButton
                      onClick={() => {
                        setSearch('');
                        setStatusFilter('all');
                      }}
                    />
                  )}
                </div>
              }
            />
          )}

          {loading ? (
            <div className="h-64 flex flex-col justify-center items-center space-y-2 text-zinc-400">
              <div className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-800 rounded-full animate-spin" />
              <span className="text-xs font-mono">Loading wallet...</span>
            </div>
          ) : needsLogin ? (
            <div className="bg-white border border-zinc-200 rounded p-12 text-center max-w-md mx-auto space-y-4">
              <AlertCircle className="w-8 h-8 mx-auto text-zinc-400" />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-zinc-950">Authentication Required</h3>
                <p className="text-xs text-zinc-500">
                  Please sign in to view and verify ownership of your tickets.
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
          ) : filteredTickets.length === 0 ? (
            <div className="bg-white border border-zinc-200 rounded-xl p-12 text-center space-y-4">
              <Ticket className="w-8 h-8 mx-auto text-zinc-300" />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-zinc-950">
                  {tickets.length === 0 ? 'No tickets yet' : 'No tickets match'}
                </h3>
                <p className="text-xs text-zinc-500">
                  {tickets.length === 0
                    ? "You don't own any tickets yet. Browse events to get started."
                    : 'Try a different search or clear your filters.'}
                </p>
              </div>
              {tickets.length === 0 && (
                <Link
                  href="/events"
                  className="inline-flex items-center px-4 py-2 border border-zinc-900 text-zinc-900 text-xs font-mono font-bold uppercase hover:bg-zinc-900 hover:text-white transition-colors rounded-lg"
                >
                  Browse events
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {filteredTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  onClick={() => handleOpenTicket(ticket)}
                  className="bg-white border border-zinc-200 hover:border-zinc-950 rounded p-6 flex flex-col justify-between cursor-pointer group transition-all"
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] font-mono bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded uppercase tracking-wider">
                        Token ID #{ticket.tokenId}
                      </span>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded tracking-wider border ${
                        ticket.status === 'valid'
                          ? 'bg-zinc-50 text-zinc-700 border-zinc-200'
                          : ticket.status === 'used'
                          ? 'bg-zinc-100 text-zinc-400 border-zinc-200 line-through'
                          : ticket.status === 'listed_for_resale'
                          ? 'bg-zinc-900 text-white border-zinc-950'
                          : 'bg-zinc-100 text-zinc-500 border-zinc-200'
                      }`}>
                        {ticket.status === 'listed_for_resale' ? 'LISTED' : ticket.status.toUpperCase()}
                      </span>
                    </div>

                    <div className="space-y-1 pt-1">
                      <h3 className="font-bold font-mono text-zinc-950 uppercase text-sm tracking-tight truncate">
                        Ticket Detail Panel
                      </h3>
                      <p className="text-xs text-zinc-500 font-mono truncate">
                        ID: {ticket.id}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono border-t border-zinc-50 pt-3 mt-4">
                    <ContractAddressRow
                      label="Addr:"
                      address={ticket.contractAddress}
                      className="max-w-[160px]"
                    />
                    <span className="text-zinc-900 font-semibold group-hover:underline flex items-center space-x-0.5">
                      <span>MANAGE</span>
                      <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Ticket Details / Rotating QR Drawer */}
      <AnimatePresence>
        {selectedTicket && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-30 backdrop-blur-sm flex justify-center items-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-zinc-200 rounded max-w-md w-full overflow-hidden shadow-2xl relative"
            >
              {/* Close button */}
              <button
                onClick={handleCloseTicket}
                className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-900 transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="p-6 space-y-6">
                {/* Header */}
                <div className="space-y-1">
                  <h3 className="font-bold font-mono text-zinc-900 text-lg uppercase tracking-tight">
                    TICKET VERIFICATION
                  </h3>
                  <p className="text-xs text-zinc-400 font-mono flex items-center gap-1 flex-wrap">
                    <span>Token ID #{selectedTicket.tokenId} · Status: {selectedTicket.status.toUpperCase()}</span>
                    <ContractExplorerLink
                      value={selectedTicket.contractAddress}
                      stopPropagation={false}
                    />
                  </p>
                </div>

                {/* Status-dependent content */}
                {selectedTicket.status === 'valid' ? (
                  <div className="space-y-4">
                    {/* Dynamic QR Display */}
                    <div className="bg-zinc-50 border border-zinc-100 rounded p-6 flex flex-col items-center justify-center space-y-3 relative min-h-[240px]">
                      {qrLoading && (
                        <div className="absolute inset-0 bg-white bg-opacity-70 flex items-center justify-center z-10">
                          <Loader2 className="w-6 h-6 animate-spin text-zinc-900" />
                        </div>
                      )}
                      {qrPayload ? (
                        <>
                          <div className="bg-white p-3 border border-zinc-200 rounded">
                            <img
                              src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrPayload)}`}
                              alt="Dynamic QR Code"
                              className="w-[180px] h-[180px] grayscale"
                            />
                          </div>
                          <div className="flex items-center space-x-2 text-xs font-mono text-zinc-500">
                            <Clock className="w-3.5 h-3.5 animate-pulse text-zinc-600" />
                            <span>ROTATING IN {qrTimeLeft}s</span>
                          </div>
                          {checkinCode && (
                            <div className="w-full max-w-[220px] space-y-1.5 pt-1">
                              <p className="text-[10px] font-mono font-bold uppercase text-zinc-400 text-center tracking-wider">
                                Backup gate code
                              </p>
                              <div className="flex items-center gap-2">
                                <code className="flex-1 text-center text-sm font-mono font-bold tracking-[0.2em] text-zinc-900 bg-white border border-zinc-200 rounded px-2 py-1.5">
                                  {formatCheckinCode(checkinCode)}
                                </code>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(formatCheckinCode(checkinCode));
                                      setCodeCopied(true);
                                      setTimeout(() => setCodeCopied(false), 1500);
                                    } catch {
                                      /* ignore */
                                    }
                                  }}
                                  className="shrink-0 p-1.5 border border-zinc-200 rounded hover:bg-zinc-100 text-zinc-600"
                                  aria-label="Copy backup code"
                                >
                                  {codeCopied ? (
                                    <Check className="w-3.5 h-3.5 text-zinc-900" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                              <p className="text-[10px] text-zinc-400 font-mono text-center leading-relaxed">
                                If the camera fails, read this code to the volunteer.
                              </p>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-center space-y-1 py-12">
                          <AlertCircle className="w-8 h-8 text-zinc-400 mx-auto" />
                          <p className="text-xs text-zinc-500 font-mono">Failed to load dynamic QR</p>
                        </div>
                      )}
                    </div>

                    <div className="flex items-start space-x-2 text-[10px] text-zinc-400 font-mono leading-relaxed bg-zinc-50 p-2.5 rounded border border-zinc-100">
                      <QrCode className="w-4 h-4 shrink-0 mt-0.5" />
                      <p>
                        This QR updates every 60 seconds. The backup code stays the same until the ticket is transferred. Screenshots of the QR will be flagged as EXPIRED at gate check-in.
                      </p>
                    </div>
                  </div>
                ) : selectedTicket.status === 'used' ? (
                  <div className="bg-zinc-50 border border-zinc-100 rounded p-12 text-center space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-zinc-400 mx-auto" />
                    <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-500">
                      TICKET ALREADY SCANNED
                    </h4>
                    <p className="text-[11px] text-zinc-400 leading-normal">
                      This ticket was verified at the gate and cannot be reused, transferred, or resold.
                    </p>
                  </div>
                ) : (
                  <div className="bg-zinc-950 text-white rounded p-6 text-center space-y-2">
                    <Tag className="w-8 h-8 text-zinc-400 mx-auto" />
                    <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-200">
                      LISTED FOR RESALE
                    </h4>
                    <p className="text-[11px] text-zinc-400 leading-normal">
                      This ticket is currently locked in the smart contract resale escrow.
                    </p>
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={handleCancelResale}
                      className="mt-4 w-full py-2 bg-white text-zinc-950 hover:bg-zinc-100 rounded text-xs font-mono font-bold uppercase transition-colors"
                    >
                      {actionLoading ? 'Cancelling...' : 'Cancel Resale Listing'}
                    </button>
                  </div>
                )}

                {/* Forms Section (only for Valid status) */}
                {selectedTicket.status === 'valid' && (
                  <div className="border-t border-zinc-100 pt-6 space-y-6">
                    <button
                      type="button"
                      disabled={pdfLoading}
                      onClick={async () => {
                        if (!selectedTicket) return;
                        setPdfLoading(true);
                        try {
                          await downloadTicketPdf(selectedTicket.id);
                        } catch {
                          setActionError('PDF download failed');
                        } finally {
                          setPdfLoading(false);
                        }
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2 border border-zinc-200 rounded text-xs font-mono font-bold uppercase hover:bg-zinc-50"
                    >
                      <Download className="w-3.5 h-3.5" />
                      {pdfLoading ? 'Generating…' : 'Download ticket PDF'}
                    </button>
                    {/* Action Selector */}
                    <div className="grid grid-cols-2 gap-4">
                      {/* Gifting / Transfer Form */}
                      <div className="space-y-2">
                        <label className="block text-[10px] font-mono font-bold uppercase text-zinc-400">
                          Gift / Transfer
                        </label>
                        <input
                          type="text"
                          placeholder="Recipient email or wallet"
                          value={recipient}
                          onChange={(e) => setRecipient(e.target.value)}
                          disabled={actionLoading}
                          className="w-full px-2.5 py-1.5 border border-zinc-200 rounded text-xs font-mono focus:outline-none focus:border-zinc-900 bg-white placeholder-zinc-300"
                        />
                        <button
                          type="button"
                          onClick={handleTransfer}
                          disabled={actionLoading || !recipient.trim()}
                          className="w-full flex items-center justify-center space-x-1 py-1.5 bg-zinc-900 text-white hover:bg-zinc-800 rounded text-xs font-mono font-bold uppercase transition-colors"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Gift</span>
                        </button>
                      </div>

                      {/* Resale Form */}
                      <div className="space-y-2">
                        <label className="block text-[10px] font-mono font-bold uppercase text-zinc-400">
                          Resell Ticket
                        </label>
                        <input
                          type="number"
                          placeholder="Price in tMSTC"
                          value={askPrice}
                          onChange={(e) => setAskPrice(e.target.value)}
                          disabled={actionLoading}
                          className="w-full px-2.5 py-1.5 border border-zinc-200 rounded text-xs font-mono focus:outline-none focus:border-zinc-900 bg-white placeholder-zinc-300"
                        />
                        <button
                          type="button"
                          onClick={handleResell}
                          disabled={actionLoading || !askPrice.trim()}
                          className="w-full flex items-center justify-center space-x-1 py-1.5 bg-zinc-900 text-white hover:bg-zinc-800 rounded text-xs font-mono font-bold uppercase transition-colors"
                        >
                          <Tag className="w-3.5 h-3.5" />
                          <span>List</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Form status reports */}
                {actionSuccess && (
                  <div className="flex flex-col gap-1.5 bg-zinc-100 text-zinc-800 px-3 py-2 rounded text-xs border border-zinc-200 font-mono">
                    <div className="flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-zinc-800 shrink-0" />
                      <span>{actionSuccess}</span>
                    </div>
                    {transferTxHash && (
                      <div className="flex items-center gap-1.5 pl-6">
                        <span className="text-zinc-500 truncate">{transferTxHash.slice(0, 14)}…</span>
                        <ContractExplorerLink value={transferTxHash} type="tx" title="View transfer transaction" />
                      </div>
                    )}
                  </div>
                )}

                {actionError && (
                  <div className="flex items-center space-x-2 bg-red-50 text-red-700 px-3 py-2 rounded text-xs border border-red-100 font-mono">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>{actionError}</span>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
