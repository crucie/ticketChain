'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, AlertCircle, Download, UserMinus, UserPlus } from 'lucide-react';
import {
  getMe,
  getAdminEvent,
  getAdminMembers,
  getEventTicketsAdmin,
  getEventVolunteersAdmin,
  assignEventVolunteerAdmin,
  revokeEventVolunteerAdmin,
  type AuthUser,
  type AdminMember,
} from '@/lib/api';
import Sidebar from '@/components/layout/Sidebar';
import EventSubNav from '@/components/admin/EventSubNav';
import { ContractExplorerLink } from '@/components/blockchain/ContractExplorerLink';

type TicketRow = Awaited<ReturnType<typeof getEventTicketsAdmin>>[number];
type VolunteerRow = Awaited<ReturnType<typeof getEventVolunteersAdmin>>[number];

function exportTicketsCsv(eventName: string, tickets: TicketRow[]) {
  const header = ['ticket_id', 'tier', 'owner_name', 'owner_email', 'owner_wallet', 'status', 'seat', 'tx_hash', 'minted_at'];
  const lines = tickets.map((t) =>
    [
      t.id,
      t.tierName,
      t.ownerName ?? '',
      t.ownerEmail ?? '',
      t.ownerWallet,
      t.status,
      t.seatNumber ?? '',
      t.transactionHash ?? '',
      t.createdAt,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(',')
  );
  const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${eventName.replace(/\s+/g, '-').toLowerCase() || 'event'}-attendees.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function EventTicketsPage({ params }: { params: { eventId: string } }) {
  const eventId = params.eventId;
  const [eventName, setEventName] = useState('');
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [volunteers, setVolunteers] = useState<VolunteerRow[]>([]);
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [assignUserId, setAssignUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const [event, data, vols, mems] = await Promise.all([
      getAdminEvent(eventId),
      getEventTicketsAdmin(eventId),
      getEventVolunteersAdmin(eventId).catch(() => [] as VolunteerRow[]),
      getAdminMembers().catch(() => [] as AdminMember[]),
    ]);
    if (event) setEventName(event.name);
    setTickets(data);
    setVolunteers(vols);
    setMembers(mems.filter((m) => m.role === 1 && m.status === 'active'));
  };

  useEffect(() => {
    void (async () => {
      try {
        const me = await getMe();
        if (!me || me.role < 2) {
          setError('Admin access required.');
          return;
        }
        await reload();
      } catch {
        setError('Failed to load tickets.');
      } finally {
        setLoading(false);
      }
    })();
  }, [eventId]);

  const handleAssign = async () => {
    if (!assignUserId) return;
    setBusy(true);
    setActionError(null);
    try {
      await assignEventVolunteerAdmin(eventId, assignUserId);
      setAssignUserId('');
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Assign failed');
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (userId: string) => {
    setBusy(true);
    setActionError(null);
    try {
      await revokeEventVolunteerAdmin(eventId, userId);
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Revoke failed');
    } finally {
      setBusy(false);
    }
  };

  const volunteerOptions = members.filter(
    (m) => !volunteers.some((v) => v.userId === m.userId && v.status === 'active')
  );

  return (
    <div className="flex bg-zinc-50 min-h-screen">
      <Sidebar type="admin" />
      <div className="flex-1 flex flex-col">
        <header className="h-16 bg-white border-b border-zinc-200 flex items-center px-8 gap-4">
          <Link href="/admin/events" className="text-zinc-400 hover:text-zinc-900">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <span className="text-sm font-mono font-bold uppercase text-zinc-400">Event tickets</span>
        </header>
        <main className="flex-1 p-8 max-w-5xl space-y-6">
          <EventSubNav eventId={eventId} eventName={eventName} />
          {error ? (
            <div className="text-center py-12">
              <AlertCircle className="w-8 h-8 mx-auto text-zinc-400" />
              <p className="text-xs text-zinc-500 mt-2">{error}</p>
            </div>
          ) : loading ? (
            <div className="text-xs font-mono text-zinc-400 text-center py-12">Loading…</div>
          ) : (
            <>
              <div className="bg-white border border-zinc-200 rounded p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-mono font-bold uppercase text-zinc-400">
                    Scanner access (volunteers)
                  </h3>
                </div>
                {actionError && (
                  <p className="text-[10px] font-mono text-red-600">{actionError}</p>
                )}
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="flex-1 min-w-[200px] space-y-1">
                    <label className="text-[10px] font-mono uppercase text-zinc-400">Grant org volunteer</label>
                    <select
                      value={assignUserId}
                      onChange={(e) => setAssignUserId(e.target.value)}
                      className="w-full border border-zinc-200 rounded px-2 py-1.5 text-xs font-mono bg-zinc-50"
                    >
                      <option value="">Select volunteer…</option>
                      {volunteerOptions.map((m) => (
                        <option key={m.id} value={m.userId}>
                          {m.email}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    disabled={!assignUserId || busy}
                    onClick={() => void handleAssign()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-zinc-900 text-white rounded text-[10px] font-mono font-bold uppercase disabled:opacity-40"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Grant
                  </button>
                </div>
                <ul className="divide-y divide-zinc-50 border border-zinc-100 rounded">
                  {volunteers.length === 0 ? (
                    <li className="px-3 py-4 text-[10px] font-mono text-zinc-400 text-center">
                      No volunteers assigned. Grant access so they can use the QR scanner.
                    </li>
                  ) : (
                    volunteers.map((v) => (
                      <li key={v.id} className="px-3 py-2 flex items-center justify-between gap-2 text-xs font-mono">
                        <div>
                          <p className="font-bold text-zinc-900">{v.email}</p>
                          <p className="text-[10px] text-zinc-400 uppercase">{v.status}</p>
                        </div>
                        {v.status === 'active' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleRevoke(v.userId)}
                            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-zinc-600 hover:text-zinc-950"
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                            Revoke
                          </button>
                        )}
                      </li>
                    ))
                  )}
                </ul>
              </div>

              <div className="flex justify-between items-center">
                <h3 className="text-xs font-mono font-bold uppercase text-zinc-400">
                  Registered attendees ({tickets.length})
                </h3>
                <button
                  type="button"
                  disabled={tickets.length === 0}
                  onClick={() => exportTicketsCsv(eventName, tickets)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-zinc-200 rounded text-[10px] font-mono font-bold uppercase hover:bg-zinc-50 disabled:opacity-40"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </button>
              </div>

              <div className="bg-white border border-zinc-200 rounded overflow-hidden">
                <table className="w-full text-xs font-mono">
                  <thead className="bg-zinc-50 border-b text-zinc-400 uppercase">
                    <tr>
                      <th className="text-left px-4 py-2">Ticket</th>
                      <th className="text-left px-4 py-2">Attendee</th>
                      <th className="text-left px-4 py-2">Tier</th>
                      <th className="text-left px-4 py-2">Status</th>
                      <th className="text-left px-4 py-2">Tx</th>
                      <th className="text-left px-4 py-2">Minted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-zinc-400">
                          No tickets minted yet.
                        </td>
                      </tr>
                    ) : (
                      tickets.map((t) => (
                        <tr key={t.id} className="border-b border-zinc-50">
                          <td className="px-4 py-2 text-zinc-500">{t.id.slice(0, 8)}…</td>
                          <td className="px-4 py-2">
                            <div className="space-y-0.5">
                              <p className="font-bold text-zinc-900">{t.ownerName || '—'}</p>
                              <p className="text-[10px] text-zinc-400">{t.ownerEmail || t.ownerWallet}</p>
                            </div>
                          </td>
                          <td className="px-4 py-2">{t.tierName}</td>
                          <td className="px-4 py-2 uppercase">{t.status}</td>
                          <td className="px-4 py-2">
                            {t.transactionHash ? (
                              <ContractExplorerLink value={t.transactionHash} type="tx" />
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-4 py-2 text-zinc-400">
                            {new Date(t.createdAt).toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
