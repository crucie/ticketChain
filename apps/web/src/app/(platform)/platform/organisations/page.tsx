'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2,
  AlertCircle,
  Plus,
} from 'lucide-react';
import { getMe, getPlatformTenants, type AuthUser, type PlatformTenant } from '@/lib/api';
import Sidebar from '@/components/layout/Sidebar';
import CreateOrgWizard from '@/components/platform/CreateOrgWizard';
import TenantDetailDrawer from '@/components/platform/TenantDetailDrawer';

export default function PlatformOrganisationsPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [showCreateWizard, setShowCreateWizard] = useState(false);

  const loadTenants = async () => {
    setFetchError(null);
    try {
      const tenantsData = await getPlatformTenants();
      setTenants(tenantsData);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load organisations');
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        const me = await getMe();
        if (!me || me.role !== 99) {
          setError('Insufficient permissions. Platform Admin role required.');
          setLoading(false);
          return;
        }
        setUser(me);
        await loadTenants();
      } catch {
        setError('Cannot connect to the API server. Please check that the backend is running.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="flex bg-zinc-50 min-h-screen">
      <Sidebar type="platform" />

      <div className="flex-1 flex flex-col min-h-screen">
        <header className="h-16 bg-white border-b border-zinc-200 flex items-center justify-between px-8">
          <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center space-x-1.5">
            <Building2 className="w-4 h-4" />
            <span>Organisations / Tenants</span>
          </h2>
          {user && (
            <div className="text-xs font-mono text-zinc-500">
              Logged in as: <strong className="text-zinc-950">{user.email}</strong>
            </div>
          )}
        </header>

        <main className="flex-1 p-8 max-w-5xl space-y-8">
          {error ? (
            <div className="bg-white border border-zinc-200 rounded p-12 text-center max-w-md mx-auto space-y-4">
              <AlertCircle className="w-8 h-8 mx-auto text-zinc-400" />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-zinc-950">Access Blocked</h3>
                <p className="text-xs text-zinc-500">{error}</p>
              </div>
            </div>
          ) : loading ? (
            <div className="h-64 flex flex-col justify-center items-center space-y-2 text-zinc-400">
              <div className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-800 rounded-full animate-spin" />
              <span className="text-xs font-mono">Fetching tenant registry...</span>
            </div>
          ) : (
            <>
              {fetchError && (
                <div className="bg-red-50 border border-red-200 rounded p-3 text-xs text-red-700 font-mono">
                  {fetchError}
                </div>
              )}

              <div className="flex justify-between items-center">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400">
                  Tenant Directory
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCreateWizard(true)}
                  className="flex items-center space-x-1.5 bg-zinc-900 text-white px-4 py-2 rounded text-xs font-mono font-bold hover:bg-zinc-800 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Organisation</span>
                </button>
              </div>

              <div className="bg-white border border-zinc-200 rounded overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs font-mono">
                    <thead>
                      <tr className="bg-zinc-50 border-b border-zinc-100 text-zinc-400 text-[10px] uppercase">
                        <th className="px-6 py-3 font-semibold">Tenant Name</th>
                        <th className="px-6 py-3 font-semibold">Slug</th>
                        <th className="px-6 py-3 font-semibold">Verification</th>
                        <th className="px-6 py-3 font-semibold">Status</th>
                        <th className="px-6 py-3 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50">
                      {tenants.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-xs font-mono text-zinc-400">
                            No organisations registered yet. Create your first tenant above.
                          </td>
                        </tr>
                      )}
                      {tenants.map((tenant) => (
                        <tr key={tenant.id} className="hover:bg-zinc-50/50 transition-colors">
                          <td className="px-6 py-4 font-bold text-zinc-950 uppercase">{tenant.name}</td>
                          <td className="px-6 py-4 text-zinc-500">{tenant.slug}</td>
                          <td className="px-6 py-4">
                            <span
                              className={`px-2 py-0.5 border rounded text-[9px] font-bold ${
                                tenant.verificationStatus === 'verified'
                                  ? 'bg-zinc-100 border-zinc-200 text-zinc-700'
                                  : tenant.verificationStatus === 'unverified' ||
                                      tenant.verificationStatus === 'under_review'
                                    ? 'bg-zinc-50 border-zinc-300 text-zinc-500'
                                    : 'bg-red-50 border-red-100 text-red-700'
                              }`}
                            >
                              {(tenant.verificationStatus ?? 'unknown').toUpperCase()}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`px-2 py-0.5 border rounded text-[9px] font-bold ${
                                tenant.status === 'active'
                                  ? 'bg-zinc-100 border-zinc-200 text-zinc-700'
                                  : 'bg-zinc-50 border-zinc-300 text-zinc-500'
                              }`}
                            >
                              {(tenant.status ?? 'unknown').toUpperCase()}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => setSelectedTenantId(tenant.id)}
                              className="text-[10px] font-mono hover:underline font-bold text-zinc-900 uppercase"
                            >
                              Review / Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      <AnimatePresence>
        {selectedTenantId && (
          <TenantDetailDrawer
            tenantId={selectedTenantId}
            onClose={() => setSelectedTenantId(null)}
            onUpdated={(patch) => {
              setTenants((prev) =>
                prev.map((t) => (t.id === patch.id ? { ...t, ...patch } : t))
              );
            }}
          />
        )}
      </AnimatePresence>

      {showCreateWizard && (
        <CreateOrgWizard
          onClose={() => setShowCreateWizard(false)}
          onCreated={(org) => {
            setTenants((prev) => [org, ...prev]);
            void loadTenants();
          }}
        />
      )}
    </div>
  );
}
