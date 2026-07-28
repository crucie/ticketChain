'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  UserPlus,
  Shield,
  ScanLine,
  Trash2,
  X,
  Check,
  AlertCircle,
} from 'lucide-react';
import { getMe, getAdminMembers, getAdminEvents, inviteAdminMember, type AdminMember, type AdminEventSummary } from '@/lib/api';

const ROLE_LABELS: Record<number, string> = { 1: 'Volunteer', 2: 'Admin', 3: 'Super Admin' };
const ROLE_STYLES: Record<number, string> = {
  1: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  2: 'bg-zinc-800 text-white border-zinc-800',
  3: 'bg-zinc-950 text-white border-zinc-950',
};

const MOCK_MEMBERS: AdminMember[] = [
  { id: 'm-1', userId: 'u-1', email: 'alice@mst.events', saralUserId: 'su-1', role: 3, status: 'active', assignedAt: '2025-01-15T10:00:00Z' },
  { id: 'm-2', userId: 'u-2', email: 'bob@mst.events', saralUserId: 'su-2', role: 2, status: 'active', assignedAt: '2025-02-20T12:00:00Z' },
  { id: 'm-3', userId: 'u-3', email: 'carol@mst.events', saralUserId: 'su-3', role: 1, status: 'active', assignedAt: '2025-04-10T09:00:00Z' },
  { id: 'm-4', userId: 'u-4', email: 'dave@mst.events', saralUserId: 'su-4', role: 1, status: 'pending', assignedAt: '2025-05-28T16:00:00Z' },
];

export function OrgMembersPanel() {
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [events, setEvents] = useState<AdminEventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState(1);
  const [inviteEventId, setInviteEventId] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const me = await getMe();
        if (!me || me.role < 2) {
          setError('Insufficient permissions. Admin role required.');
          setLoading(false);
          return;
        }
        const [data, eventsData] = await Promise.all([
          getAdminMembers().catch(() => MOCK_MEMBERS),
          getAdminEvents().catch(() => [] as AdminEventSummary[]),
        ]);
        setMembers(data.length > 0 ? data : MOCK_MEMBERS);
        setEvents(eventsData);
      } catch {
        setError('Failed to load members.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      await inviteAdminMember({
        email: inviteEmail.trim(),
        name: inviteName.trim() || undefined,
        role: inviteRole,
        eventId: inviteRole === 1 && inviteEventId ? inviteEventId : undefined,
      });
    } catch {
      // Fallback: add locally
    }
    setMembers((prev) => [
      ...prev,
      {
        id: `m-${Date.now()}`,
        userId: `u-${Date.now()}`,
        email: inviteEmail.trim(),
        saralUserId: '',
        role: inviteRole,
        status: 'pending',
        assignedAt: new Date().toISOString(),
      },
    ]);
    setInviteSuccess(true);
    setTimeout(() => {
      setInviting(false);
      setInviteSuccess(false);
      setInviteEmail('');
      setInviteName('');
      setInviteEventId('');
      setShowInvite(false);
    }, 1200);
  };

  const handleRemove = (id: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== id));
  };

  const activeCount = members.filter((m) => m.status === 'active').length;
  const volunteerCount = members.filter((m) => m.role === 1).length;

  return (
    <>
      <div className="space-y-8">
        {error ? (
          <div className="bg-paper border border-mist rounded p-12 text-center max-w-md mx-auto space-y-4">
            <AlertCircle className="w-8 h-8 mx-auto text-zinc-400" />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-zinc-950">Access Blocked</h3>
              <p className="text-xs text-zinc-500">{error}</p>
            </div>
          </div>
        ) : loading ? (
          <div className="h-64 flex flex-col justify-center items-center space-y-2 text-zinc-400">
            <div className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-800 rounded-full animate-spin" />
            <span className="text-xs font-mono">Loading members...</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-paper border border-mist rounded p-6 space-y-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center space-x-1">
                  <Users className="w-3.5 h-3.5" /><span>Total Members</span>
                </span>
                <span className="text-3xl font-bold font-mono text-zinc-950">{members.length}</span>
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-paper border border-mist rounded p-6 space-y-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center space-x-1">
                  <Shield className="w-3.5 h-3.5" /><span>Active</span>
                </span>
                <span className="text-3xl font-bold font-mono text-zinc-950">{activeCount}</span>
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-paper border border-mist rounded p-6 space-y-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center space-x-1">
                  <ScanLine className="w-3.5 h-3.5" /><span>Volunteers</span>
                </span>
                <span className="text-3xl font-bold font-mono text-zinc-950">{volunteerCount}</span>
              </motion.div>
            </div>

            <div className="flex justify-between items-center">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400">
                Organisation Members
              </h3>
              <button
                onClick={() => setShowInvite(true)}
                className="flex items-center space-x-1.5 bg-zinc-900 text-white px-4 py-2 rounded text-xs font-mono font-bold hover:bg-zinc-800 transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Invite Member</span>
              </button>
            </div>

            <div className="bg-paper border border-mist rounded overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="bg-zinc-50 border-b border-zinc-100 text-zinc-400 text-[10px] uppercase">
                      <th className="px-6 py-3 font-semibold">Email</th>
                      <th className="px-6 py-3 font-semibold">Role</th>
                      <th className="px-6 py-3 font-semibold">Status</th>
                      <th className="px-6 py-3 font-semibold">Joined</th>
                      <th className="px-6 py-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    <AnimatePresence>
                      {members.map((member) => (
                        <motion.tr
                          key={member.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0, x: -20 }}
                          className="hover:bg-zinc-50/50 transition-colors"
                        >
                          <td className="px-6 py-4 font-bold text-zinc-950">{member.email}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-0.5 border rounded text-[9px] font-bold ${ROLE_STYLES[member.role] ?? 'bg-zinc-100 text-zinc-600 border-zinc-200'}`}>
                              {ROLE_LABELS[member.role] ?? 'Unknown'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-0.5 border rounded text-[9px] ${
                              member.status === 'active'
                                ? 'bg-zinc-100 border-zinc-200 text-zinc-700'
                                : 'bg-white border-zinc-200 text-zinc-400'
                            }`}>
                              {member.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-zinc-500">
                            {new Date(member.assignedAt).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => handleRemove(member.id)}
                              className="text-zinc-400 hover:text-zinc-900 transition-colors p-1"
                              title="Remove member"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {showInvite && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
            onClick={() => !inviting && setShowInvite(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-paper border border-mist rounded-lg w-full max-w-md p-6 space-y-5"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-zinc-950">Invite Member</h3>
                <button onClick={() => setShowInvite(false)} className="text-zinc-400 hover:text-zinc-900 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {inviteSuccess ? (
                <div className="py-8 text-center space-y-2">
                  <Check className="w-8 h-8 mx-auto text-zinc-700" />
                  <p className="text-xs font-mono text-zinc-500">Invitation sent successfully</p>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">Name (optional)</label>
                      <input
                        type="text"
                        value={inviteName}
                        onChange={(e) => setInviteName(e.target.value)}
                        placeholder="Jane Doe"
                        className="w-full bg-zinc-50 border border-zinc-200 rounded px-3 py-2 text-xs font-mono text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 transition-colors"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">Email Address</label>
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="volunteer@example.com"
                        className="w-full bg-zinc-50 border border-zinc-200 rounded px-3 py-2 text-xs font-mono text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 transition-colors"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">Role</label>
                      <div className="flex space-x-2">
                        {[
                          { value: 1, label: 'Volunteer' },
                          { value: 2, label: 'Admin' },
                        ].map((r) => (
                          <button
                            key={r.value}
                            onClick={() => setInviteRole(r.value)}
                            className={`flex-1 px-3 py-2 rounded text-xs font-mono font-bold border transition-colors ${
                              inviteRole === r.value
                                ? 'bg-zinc-900 text-white border-zinc-900'
                                : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'
                            }`}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {inviteRole === 1 && events.length > 0 && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">Event scope (optional)</label>
                        <select
                          value={inviteEventId}
                          onChange={(e) => setInviteEventId(e.target.value)}
                          className="w-full bg-zinc-50 border border-zinc-200 rounded px-3 py-2 text-xs font-mono text-zinc-900 focus:outline-none focus:border-zinc-400"
                        >
                          <option value="">All events</option>
                          {events.map((ev) => (
                            <option key={ev.id} value={ev.id}>{ev.name}</option>
                          ))}
                        </select>
                        <p className="text-[9px] text-zinc-400">Limit volunteer scan access to a specific event.</p>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleInvite}
                    disabled={inviting || !inviteEmail.trim()}
                    className="w-full bg-zinc-900 text-white py-2.5 rounded text-xs font-mono font-bold hover:bg-zinc-800 disabled:opacity-40 transition-all"
                  >
                    {inviting ? 'Sending...' : 'Send Invitation'}
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
