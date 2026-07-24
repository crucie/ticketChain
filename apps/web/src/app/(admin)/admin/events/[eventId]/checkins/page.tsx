'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, AlertCircle } from 'lucide-react';
import { getMe, getAdminEvent, getEventCheckinsAdmin, getEventAnalytics, type AuthUser } from '@/lib/api';
import Sidebar from '@/components/layout/Sidebar';
import EventSubNav from '@/components/admin/EventSubNav';
import { ContractExplorerLink } from '@/components/blockchain/ContractExplorerLink';

export default function EventCheckinsPage({ params }: { params: { eventId: string } }) {
  const eventId = params.eventId;
  const [eventName, setEventName] = useState('');
  const [checkins, setCheckins] = useState<Array<{
    id: string;
    ticketId: string;
    zoneAccessed: string | null;
    scanMethod: string;
    success: boolean;
    transactionHash?: string | null;
    chainStatus?: string | null;
    createdAt: string;
  }>>([]);
  const [liveCount, setLiveCount] = useState({ checkedIn: 0, sold: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    const [data, analytics] = await Promise.all([
      getEventCheckinsAdmin(eventId),
      getEventAnalytics(eventId).catch(() => null),
    ]);
    setCheckins(data);
    if (analytics) {
      setLiveCount({ checkedIn: analytics.totalCheckedIn, sold: analytics.totalTicketsSold });
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        const me = await getMe();
        if (!me || me.role < 2) {
          setError('Admin access required.');
          return;
        }
        const event = await getAdminEvent(eventId);
        if (event) setEventName(event.name);
        await refresh();
      } catch {
        setError('Failed to load check-ins.');
      } finally {
        setLoading(false);
      }
    })();
  }, [eventId]);

  useEffect(() => {
    const interval = setInterval(() => {
      void refresh().catch(() => undefined);
    }, 5000);
    return () => clearInterval(interval);
  }, [eventId]);

  return (
    <div className="flex bg-zinc-50 min-h-screen">
      <Sidebar type="admin" />
      <div className="flex-1 flex flex-col">
        <header className="h-16 bg-white border-b border-zinc-200 flex items-center px-8 gap-4">
          <Link href="/admin/events" className="text-zinc-400 hover:text-zinc-900">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <span className="text-sm font-mono font-bold uppercase text-zinc-400">Check-in log</span>
          <span className="ml-auto text-xs font-mono text-zinc-500">
            LIVE: {liveCount.checkedIn} / {liveCount.sold}
          </span>
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
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="inline-flex items-center gap-1 text-xs font-mono text-zinc-500 hover:text-zinc-900"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Refresh
                </button>
              </div>
              <div className="bg-white border border-zinc-200 rounded overflow-hidden">
                <table className="w-full text-xs font-mono">
                  <thead className="bg-zinc-50 border-b text-zinc-400 uppercase">
                    <tr>
                      <th className="text-left px-4 py-2">Time</th>
                      <th className="text-left px-4 py-2">Ticket</th>
                      <th className="text-left px-4 py-2">Zone</th>
                      <th className="text-left px-4 py-2">Method</th>
                      <th className="text-left px-4 py-2">Result</th>
                      <th className="text-left px-4 py-2">Tx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checkins.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-zinc-400">No check-ins yet.</td>
                      </tr>
                    ) : (
                      checkins.map((c) => (
                        <tr key={c.id} className="border-b border-zinc-100">
                          <td className="px-4 py-3">{new Date(c.createdAt).toLocaleString()}</td>
                          <td className="px-4 py-3">{c.ticketId.slice(0, 8)}…</td>
                          <td className="px-4 py-3">{c.zoneAccessed ?? '—'}</td>
                          <td className="px-4 py-3 uppercase">{c.scanMethod}</td>
                          <td className="px-4 py-3">
                            <span className={c.success ? 'text-green-700' : 'text-red-600'}>
                              {c.success ? 'ADMIT' : 'DENY'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {c.transactionHash ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-zinc-500">
                                  {c.chainStatus === 'confirmed' ? '✓' : c.chainStatus ?? 'tx'}
                                </span>
                                <ContractExplorerLink value={c.transactionHash} type="tx" />
                              </div>
                            ) : c.success ? (
                              <span className="text-zinc-400">
                                {c.chainStatus === 'pending' ? 'Pending' : '—'}
                              </span>
                            ) : (
                              <span className="text-zinc-300">—</span>
                            )}
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
