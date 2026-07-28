'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  TrendingUp,
  Activity,
  Server,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { getMe, getPlatformKPIs, getPlatformTenants, type AuthUser, type PlatformKPIs, type PlatformTenant } from '@/lib/api';
import Sidebar from '@/components/layout/Sidebar';

function isHealthy(status: string) {
  return status === 'healthy' || status === 'operational';
}

export default function PlatformDashboardPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [kpis, setKpis] = useState<PlatformKPIs | null>(null);
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const loadData = async () => {
    setFetchError(null);
    try {
      const [kpiData, tenantsData] = await Promise.all([
        getPlatformKPIs(),
        getPlatformTenants(),
      ]);
      setKpis(kpiData);
      setTenants(tenantsData);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load platform data');
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
        await loadData();
      } catch {
        setError('Failed to authenticate.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const weiToTokensVal = (wei: string) =>
    (Number(wei) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 2 });

  return (
    <div className="flex bg-zinc-50 min-h-screen">
      <Sidebar type="platform" />

      <div className="flex-1 flex flex-col min-h-screen">
        <header className="h-16 bg-white border-b border-zinc-200 flex items-center justify-between px-8">
          <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center space-x-1.5">
            <LayoutDashboard className="w-4 h-4" />
            <span>Platform Overview</span>
          </h2>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => void loadData()}
              className="text-zinc-400 hover:text-zinc-900 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            {user && (
              <div className="text-xs font-mono text-zinc-500">
                Logged in as: <strong className="text-zinc-950">{user.email}</strong>
              </div>
            )}
          </div>
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
              <span className="text-xs font-mono">Fetching platform metrics...</span>
            </div>
          ) : (
            <>
              {fetchError && (
                <div className="bg-red-50 border border-red-100 text-red-700 text-xs font-mono p-3 rounded flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {fetchError}
                </div>
              )}

              {kpis && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {[
                      { label: 'Platform Tenants', value: kpis.activeTenants.toString(), icon: Building2, subtitle: 'active organizations' },
                      { label: 'Total Tickets Sold', value: kpis.totalTicketsSold.toLocaleString(), icon: TrendingUp, subtitle: 'across all events' },
                      { label: 'Commission Revenue', value: weiToTokensVal(kpis.commissionRevenueWei), icon: CreditCard, subtitle: 'tMSTC earned' },
                      { label: 'Gross Volume', value: weiToTokensVal(kpis.grossRevenueWei), icon: Activity, subtitle: 'tMSTC transacted' },
                    ].map((kpi, idx) => {
                      const Icon = kpi.icon;
                      return (
                        <motion.div
                          key={kpi.label}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className="bg-white border border-zinc-200 rounded p-6 space-y-2"
                        >
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center space-x-1">
                            <Icon className="w-3.5 h-3.5" /><span>{kpi.label}</span>
                          </span>
                          <div className="space-y-0.5">
                            <span className="text-2xl font-bold font-mono text-zinc-950">{kpi.value}</span>
                            <span className="block text-[9px] text-zinc-400 uppercase font-mono">{kpi.subtitle}</span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white border border-zinc-200 rounded p-6 flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-zinc-100 rounded">
                          <Server className="w-4 h-4 text-zinc-600" />
                        </div>
                        <div>
                          <h4 className="text-xs font-mono font-bold uppercase text-zinc-950">MST RPC</h4>
                          <p className="text-[10px] font-mono text-zinc-400 uppercase">Status: {kpis.rpcHealth}</p>
                        </div>
                      </div>
                      <span className={`h-2 w-2 rounded-full ${isHealthy(kpis.rpcHealth) ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                    </div>
                    <div className="bg-white border border-zinc-200 rounded p-6 flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-zinc-100 rounded">
                          <Activity className="w-4 h-4 text-zinc-600" />
                        </div>
                        <div>
                          <h4 className="text-xs font-mono font-bold uppercase text-zinc-950">Database Node Cluster</h4>
                          <p className="text-[10px] font-mono text-zinc-400 uppercase">Status: {kpis.dbHealth}</p>
                        </div>
                      </div>
                      <span className={`h-2 w-2 rounded-full ${isHealthy(kpis.dbHealth) ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                    </div>
                  </div>
                </>
              )}

              <div className="bg-white border border-zinc-200 rounded overflow-hidden">
                <div className="px-6 py-4 border-b border-zinc-100 flex justify-between items-center">
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400">Tenant Directories</h3>
                  <Link href="/platform/organisations" className="text-xs font-mono font-bold text-zinc-950 hover:underline">
                    Manage Tenants
                  </Link>
                </div>
                {tenants.length === 0 ? (
                  <div className="p-12 text-center text-xs font-mono text-zinc-400">
                    No organisations yet. Create your first tenant from the Organisations page.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs font-mono">
                      <thead>
                        <tr className="bg-zinc-50 border-b border-zinc-100 text-zinc-400 text-[10px] uppercase">
                          <th className="px-6 py-3 font-semibold">Tenant Name</th>
                          <th className="px-6 py-3 font-semibold">Slug</th>
                          <th className="px-6 py-3 font-semibold">Plan</th>
                          <th className="px-6 py-3 font-semibold">KYC</th>
                          <th className="px-6 py-3 font-semibold text-right">Commission Fee</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-50">
                        {tenants.map((tenant) => (
                          <tr key={tenant.id} className="hover:bg-zinc-50/50 transition-colors">
                            <td className="px-6 py-4 font-bold text-zinc-950 uppercase">{tenant.name}</td>
                            <td className="px-6 py-4 text-zinc-500 font-mono">{tenant.slug}</td>
                            <td className="px-6 py-4 uppercase text-zinc-500">{tenant.subscriptionPlan}</td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-0.5 border rounded text-[9px] font-bold ${
                                tenant.verificationStatus === 'verified'
                                  ? 'bg-zinc-100 border-zinc-200 text-zinc-700'
                                  : tenant.verificationStatus === 'unverified' || tenant.verificationStatus === 'under_review'
                                  ? 'bg-zinc-50 border-zinc-300 text-zinc-500'
                                  : 'bg-red-50 border-red-100 text-red-700'
                              }`}>
                                {(tenant.verificationStatus ?? 'unknown').toUpperCase()}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right font-bold text-zinc-950">
                              {(tenant.platformCommissionBps / 100).toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
