'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Camera,
  RefreshCw,
  History,
  CheckCircle,
  XCircle,
  Shield,
  Loader2,
  AlertCircle,
  FileText,
  UserCheck,
  Zap,
  WifiOff,
  Radio,
} from 'lucide-react';
import { decodeQrFromVideo } from '@/lib/qr-scanner';
import {
  getMe,
  verifyCheckin,
  getCheckinStats,
  getCheckinHistory,
  type AuthUser,
  type CheckinStats,
  type CheckinHistoryItem
} from '@/lib/api';
import Navbar from '@/components/layout/Navbar';
import { fetchAndCacheSnapshot } from '@/lib/offline-checkin';
import { ContractExplorerLink } from '@/components/blockchain/ContractExplorerLink';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

export default function CheckinConsolePage({ params }: { params: { eventId: string } }) {
  const eventId = params.eventId;
  const [user, setUser] = useState<AuthUser | null>(null);
  const [stats, setStats] = useState<CheckinStats | null>(null);
  const [history, setHistory] = useState<CheckinHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected scanning zone
  const [activeZone, setActiveZone] = useState<string>('ALL');

  // Scanner status
  const [selectedMethod, setSelectedMethod] = useState<'camera' | 'manual'>('camera');
  const [manualPayload, setManualPayload] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);

  // Verification results overlay
  const [scanResult, setScanResult] = useState<{
    show: boolean;
    success: boolean;
    reason?: string;
    details?: {
      id: string;
      tokenId: number;
      ownerWalletAddress: string;
      zone: string;
    };
    chainStatus?: 'pending' | 'confirmed' | 'failed' | null;
    transactionHash?: string | null;
    explorerUrl?: string | null;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastScanRef = useRef<string>('');
  const scanCooldownRef = useRef(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [nfcSupported, setNfcSupported] = useState(false);

  const fetchStatsAndHistory = async () => {
    try {
      const [s, h] = await Promise.all([
        getCheckinStats(eventId).catch(() => ({ totalCheckedIn: 0, totalTicketsSold: 0, remainingCount: 0 })),
        getCheckinHistory(eventId).catch(() => [] as CheckinHistoryItem[])
      ]);
      setStats(s);
      setHistory(h);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    setIsOffline(!navigator.onLine);
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    setNfcSupported(typeof window !== 'undefined' && 'NDEFReader' in window);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const me = await getMe();
        if (!me || me.role < 1) {
          setError('Volunteer authentication required.');
          setLoading(false);
          return;
        }
        setUser(me);
        await Promise.all([
          fetchStatsAndHistory(),
          fetchAndCacheSnapshot(eventId, API_URL).catch(() => undefined),
        ]);
      } catch (err) {
        console.error(err);
        setError('Failed to load check-in console.');
      } finally {
        setLoading(false);
      }
    })();
  }, [eventId]);

  useEffect(() => {
    const interval = setInterval(() => {
      void fetchStatsAndHistory();
    }, 3000);
    return () => clearInterval(interval);
  }, [eventId]);

  // Handle webcam video setup
  useEffect(() => {
    if (selectedMethod !== 'camera' || !user) return;

    let localStream: MediaStream | null = null;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        localStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(console.error);
        }
        setCameraActive(true);
      } catch (err) {
        console.warn('Webcam permission not granted or available', err);
        setCameraActive(false);
      }
    })();

    return () => {
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
      setCameraActive(false);
    };
  }, [selectedMethod, user]);

  useEffect(() => {
    if (selectedMethod !== 'camera' || !cameraActive || !user) return;

    let rafId = 0;
    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && !scanCooldownRef.current && !verifyLoading) {
        const decoded = decodeQrFromVideo(video, canvas);
        if (decoded && decoded !== lastScanRef.current) {
          lastScanRef.current = decoded;
          scanCooldownRef.current = true;
          void handleScanSubmit(decoded).finally(() => {
            setTimeout(() => {
              scanCooldownRef.current = false;
            }, 2000);
          });
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [selectedMethod, cameraActive, user, verifyLoading]);

  const handleNfcScan = async () => {
    // Web NFC API — browser support varies (mainly Android Chrome)
    const NfcReader = (window as unknown as { NDEFReader?: new () => {
      scan: () => Promise<void>;
      addEventListener: (ev: string, cb: (e: { message: { records: Array<{ recordType: string; data: DataView }> } }) => void) => void;
    } }).NDEFReader;
    if (!NfcReader) return;
    try {
      const reader = new NfcReader();
      await reader.scan();
      reader.addEventListener('reading', (event) => {
        for (const record of event.message.records) {
          if (record.recordType === 'text') {
            const text = new TextDecoder().decode(record.data);
            void handleScanSubmit(text);
            return;
          }
        }
      });
    } catch (err) {
      console.warn('NFC scan failed', err);
    }
  };

  const handleScanSubmit = async (payload: string) => {
    if (!payload.trim()) return;
    setVerifyLoading(true);
    try {
      // Calls standard verification endpoint: POST /api/volunteer/checkin/verify
      const result = await verifyCheckin(payload, 'PWA_SCANNER_DEVICE_01');

      if (result.success && result.ticket) {
        // Zone filtering check on client side for quick feedback
        if (activeZone !== 'ALL' && result.ticket.zone !== activeZone) {
          setScanResult({
            show: true,
            success: false,
            reason: `WRONG_ZONE: Ticket is configured for ${result.ticket.zone} but this gate is scanning ${activeZone}.`
          });
        } else {
          setScanResult({
            show: true,
            success: true,
            details: result.ticket,
            chainStatus: result.chainStatus ?? null,
            transactionHash: result.transactionHash ?? null,
            explorerUrl: result.explorerUrl ?? null,
          });
        }
      } else {
        setScanResult({
          show: true,
          success: false,
          reason: result.reason ?? 'Verification failed'
        });
      }
      void fetchStatsAndHistory();
    } catch (err) {
      setScanResult({
        show: true,
        success: false,
        reason: err instanceof Error ? err.message : 'Unknown scan error'
      });
    } finally {
      setVerifyLoading(false);
      setManualPayload('');
    }
  };

  // Simulators for testing
  const simulateScan = (type: 'valid' | 'already_used' | 'invalid_signature' | 'wrong_zone') => {
    let mockPayload = '';
    
    // Simulate raw base64 structures containing ticket ID + signature
    if (type === 'valid') {
      const data = {
        tid: 'ticket-valid-uuid-001',
        ts: Math.floor(Date.now() / 1000),
        n: 'nonce-valid-01',
        sig: 'hmac-signature-valid-01'
      };
      mockPayload = btoa(JSON.stringify(data));
    } else if (type === 'already_used') {
      const data = {
        tid: 'ticket-used-uuid-002',
        ts: Math.floor(Date.now() / 1000),
        n: 'nonce-used-02',
        sig: 'hmac-signature-used-02'
      };
      mockPayload = btoa(JSON.stringify(data));
    } else if (type === 'invalid_signature') {
      const data = {
        tid: 'ticket-fake-uuid-003',
        ts: Math.floor(Date.now() / 1000),
        n: 'nonce-fake-03',
        sig: 'bad-hmac-signature-03'
      };
      mockPayload = btoa(JSON.stringify(data));
    } else if (type === 'wrong_zone') {
      const data = {
        tid: 'ticket-wrong-zone-uuid-004',
        ts: Math.floor(Date.now() / 1000),
        n: 'nonce-wrong-04',
        sig: 'hmac-signature-wrong-04'
      };
      mockPayload = btoa(JSON.stringify(data));
    }
    
    void handleScanSubmit(mockPayload);
  };

  return (
    <>
      <Navbar />
      <div className="bg-zinc-50 min-h-[calc(100vh-4rem)] pb-16">
        {/* Navigation bar */}
        <section className="bg-white border-b border-zinc-200 py-4">
          <div className="max-w-6xl mx-auto px-4 flex justify-between items-center">
            <Link
              href="/checkin"
              className="inline-flex items-center text-xs font-mono font-bold text-zinc-500 hover:text-zinc-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              <span>BACK TO ASSIGNED EVENTS</span>
            </Link>

            <div className="flex items-center gap-4">
              {isOffline && (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded">
                  <WifiOff className="w-3 h-3" />
                  Offline mode
                </span>
              )}
              {stats && (
                <div className="text-xs font-mono text-zinc-500 flex items-center space-x-4">
                  <span>LIVE: <strong className="text-zinc-950">{stats.totalCheckedIn} / {stats.totalTicketsSold}</strong></span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Content Panel */}
        <main className="max-w-6xl mx-auto px-4 mt-6">
          {error ? (
            <div className="bg-white border border-zinc-200 rounded p-12 text-center max-w-md mx-auto space-y-4">
              <AlertCircle className="w-8 h-8 mx-auto text-zinc-400" />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-zinc-950">Console Locked</h3>
                <p className="text-xs text-zinc-500">{error}</p>
              </div>
            </div>
          ) : loading ? (
            <div className="h-64 flex flex-col justify-center items-center space-y-2 text-zinc-400">
              <div className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-800 rounded-full animate-spin" />
              <span className="text-xs font-mono">Launching check-in console...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Column: Scanning Module */}
              <div className="lg:col-span-2 space-y-6">
                {/* Scanner panel */}
                <div className="bg-white border border-zinc-200 rounded overflow-hidden flex flex-col justify-between min-h-[460px]">
                  {/* Selector tabs */}
                  <div className="flex border-b border-zinc-100 bg-zinc-50 p-1">
                    <button
                      onClick={() => setSelectedMethod('camera')}
                      className={`flex-1 py-2 text-xs font-mono font-bold uppercase rounded transition-colors ${
                        selectedMethod === 'camera'
                          ? 'bg-white text-zinc-950 border border-zinc-200'
                          : 'text-zinc-500 hover:text-zinc-950'
                      }`}
                    >
                      Camera Scanner
                    </button>
                    <button
                      onClick={() => setSelectedMethod('manual')}
                      className={`flex-1 py-2 text-xs font-mono font-bold uppercase rounded transition-colors ${
                        selectedMethod === 'manual'
                          ? 'bg-white text-zinc-950 border border-zinc-200'
                          : 'text-zinc-500 hover:text-zinc-950'
                      }`}
                    >
                      Manual Input
                    </button>
                  </div>

                  {/* Body widget */}
                  <div className="p-6 flex-1 flex flex-col items-center justify-center relative">
                    {verifyLoading && (
                      <div className="absolute inset-0 bg-white bg-opacity-70 flex items-center justify-center z-10">
                        <Loader2 className="w-6 h-6 animate-spin text-zinc-900" />
                      </div>
                    )}

                    {selectedMethod === 'camera' ? (
                      <div className="w-full max-w-sm space-y-4">
                        {/* Video frame mockup */}
                        <div className="aspect-[4/3] bg-zinc-900 rounded border border-zinc-800 relative overflow-hidden flex items-center justify-center">
                          <canvas ref={canvasRef} className="hidden" />
                          {cameraActive ? (
                            <video
                              ref={videoRef}
                              className="w-full h-full object-cover"
                              playsInline
                              muted
                            />
                          ) : (
                            <div className="text-center space-y-2">
                              <Camera className="w-10 h-10 text-zinc-700 mx-auto animate-pulse" />
                              <p className="text-[10px] font-mono text-zinc-500">Camera stream active</p>
                            </div>
                          )}
                          {/* HUD Overlay Target lines */}
                          <div className="absolute inset-8 border border-white border-opacity-30 rounded pointer-events-none flex items-center justify-center">
                            <div className="w-2/3 h-2/3 border-2 border-dashed border-white border-opacity-20 rounded" />
                          </div>
                        </div>

                        {nfcSupported && (
                          <button
                            type="button"
                            onClick={() => void handleNfcScan()}
                            className="w-full py-2 border border-zinc-200 rounded text-xs font-mono font-bold uppercase flex items-center justify-center gap-2 hover:bg-zinc-50"
                          >
                            <Radio className="w-3.5 h-3.5" />
                            Scan NFC tag
                          </button>
                        )}
                        <p className="text-[10px] font-mono text-zinc-400 text-center">
                          Point camera at ticket QR — auto-detects codes
                        </p>
                        {/* Simulator controls for rapid check testing */}
                        <div className="space-y-2">
                          <span className="block text-[10px] font-mono font-bold uppercase text-zinc-400 text-center">
                            Test simulator
                          </span>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => simulateScan('valid')}
                              className="py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded text-[10px] font-mono font-bold uppercase tracking-wider transition-colors"
                            >
                              Scan Valid
                            </button>
                            <button
                              type="button"
                              onClick={() => simulateScan('already_used')}
                              className="py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded text-[10px] font-mono font-bold uppercase tracking-wider transition-colors"
                            >
                              Scan Duplicate
                            </button>
                            <button
                              type="button"
                              onClick={() => simulateScan('invalid_signature')}
                              className="py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded text-[10px] font-mono font-bold uppercase tracking-wider transition-colors"
                            >
                              Scan Bad Sig
                            </button>
                            <button
                              type="button"
                              onClick={() => simulateScan('wrong_zone')}
                              className="py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded text-[10px] font-mono font-bold uppercase tracking-wider transition-colors"
                            >
                              Wrong Zone
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full max-w-sm space-y-4">
                        <div className="space-y-1.5">
                          <label className="block text-[10px] font-mono font-bold uppercase text-zinc-400">
                            Ticket payload string
                          </label>
                          <textarea
                            rows={4}
                            value={manualPayload}
                            onChange={(e) => setManualPayload(e.target.value)}
                            placeholder="Paste ticket base64 payload string here..."
                            className="w-full px-3 py-2 border border-zinc-200 rounded text-xs font-mono focus:outline-none focus:border-zinc-950 focus:ring-1 focus:ring-zinc-950 bg-white placeholder-zinc-300"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={!manualPayload.trim() || verifyLoading}
                          onClick={() => void handleScanSubmit(manualPayload)}
                          className="w-full py-2 bg-zinc-900 text-white hover:bg-zinc-800 rounded text-xs font-mono font-bold uppercase tracking-wider transition-colors"
                        >
                          Submit Verification
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Options & Scan history log */}
              <div className="space-y-6">
                {/* Gate Configurations */}
                <div className="bg-white border border-zinc-200 rounded p-6 space-y-4">
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center space-x-1.5">
                    <Shield className="w-4 h-4" />
                    <span>Gate Zone setup</span>
                  </h3>
                  <div className="space-y-1">
                    {['ALL', 'GA', 'VIP', 'Backstage'].map((zone) => (
                      <button
                        key={zone}
                        onClick={() => setActiveZone(zone)}
                        className={`w-full text-left px-2.5 py-1.5 text-xs font-mono rounded transition-colors ${
                          activeZone === zone
                            ? 'bg-zinc-950 text-white font-bold'
                            : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950'
                        }`}
                      >
                        {zone === 'ALL' ? 'SCAN ALL ZONES' : `GATE ZONE: ${zone}`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Scan log list */}
                <div className="bg-white border border-zinc-200 rounded p-6 space-y-4">
                  <div className="flex justify-between items-center border-b border-zinc-100 pb-3">
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center space-x-1.5">
                      <History className="w-4 h-4" />
                      <span>Recent scans</span>
                    </h3>
                    <button
                      onClick={() => void fetchStatsAndHistory()}
                      className="p-1 text-zinc-400 hover:text-zinc-950 transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {history.length === 0 ? (
                    <div className="text-xs font-mono text-zinc-400 py-12 text-center border border-dashed border-zinc-100 rounded">
                      Log is empty. Start scanning.
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[300px] overflow-y-auto">
                      {history.slice(0, 10).map((item) => (
                        <div
                          key={item.id}
                          className="flex justify-between items-start text-[10px] font-mono border-b border-zinc-50 pb-2"
                        >
                          <div className="space-y-0.5">
                            <span className="font-bold text-zinc-800">
                              Ticket #{item.tokenId || item.ticketId.slice(0, 8)}
                            </span>
                            <p className="text-zinc-400">
                              Zone: {item.zoneAccessed || 'N/A'} · {new Date(item.createdAt).toLocaleTimeString()}
                            </p>
                          </div>
                          <span className={`px-1.5 py-0.5 rounded font-semibold ${
                            item.verificationSuccess
                              ? 'bg-zinc-100 text-zinc-800'
                              : 'bg-red-50 text-red-700'
                          }`}>
                            {item.verificationSuccess ? 'ADMIT' : 'DENY'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Screen verification overlay */}
      <AnimatePresence>
        {scanResult?.show && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-40 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className={`w-full max-w-sm rounded-lg overflow-hidden border p-8 text-center space-y-6 shadow-2xl relative ${
                scanResult.success
                  ? 'bg-white border-zinc-950 text-zinc-900'
                  : 'bg-zinc-950 border-zinc-900 text-white'
              }`}
            >
              {/* Close Button overlay */}
              <button
                onClick={() => setScanResult(null)}
                className="absolute top-4 right-4 p-1 text-zinc-400 hover:text-zinc-900 transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>

              <div className="space-y-4">
                {scanResult.success ? (
                  <>
                    <CheckCircle className="w-16 h-16 mx-auto text-zinc-900" />
                    <div className="space-y-2">
                      <h2 className="text-3xl font-extrabold font-mono tracking-tight">ADMIT</h2>
                      {scanResult.details && (
                        <div className="space-y-1 bg-zinc-50 border border-zinc-200 rounded p-4 text-xs font-mono text-zinc-700 inline-block w-full">
                          <p className="font-bold">Ticket #{scanResult.details.tokenId}</p>
                          <p>ZONE ACCESS: {scanResult.details.zone.toUpperCase() || 'ALL'}</p>
                          <p className="text-[10px] text-zinc-400 truncate">Wallet: {scanResult.details.ownerWalletAddress}</p>
                          <div className="pt-2 border-t border-zinc-200 mt-2 space-y-1">
                            <p className="text-[10px] uppercase tracking-wider text-zinc-400">
                              Chain:{' '}
                              <span className="text-zinc-800 font-semibold">
                                {scanResult.chainStatus === 'confirmed'
                                  ? 'Confirmed'
                                  : scanResult.chainStatus === 'pending'
                                    ? 'Pending'
                                    : scanResult.transactionHash
                                      ? 'Submitted'
                                      : 'Off-chain only'}
                              </span>
                            </p>
                            {scanResult.transactionHash && (
                              <div className="flex items-center justify-center gap-1.5">
                                <span className="text-[10px] text-zinc-500 truncate max-w-[140px]">
                                  {scanResult.transactionHash.slice(0, 10)}…
                                </span>
                                <ContractExplorerLink
                                  value={scanResult.transactionHash}
                                  type="tx"
                                  title="View check-in transaction"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <XCircle className="w-16 h-16 mx-auto text-red-500" />
                    <div className="space-y-2">
                      <h2 className="text-3xl font-extrabold font-mono tracking-tight text-red-500">DENY</h2>
                      <div className="bg-zinc-900 border border-zinc-800 rounded p-4 text-xs font-mono text-zinc-300 w-full">
                        <p className="font-semibold text-red-400">REASON:</p>
                        <p className="mt-1 leading-normal uppercase">{scanResult.reason?.replace('_', ' ')}</p>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => setScanResult(null)}
                className={`w-full py-2.5 rounded text-xs font-mono font-bold uppercase tracking-wider transition-colors ${
                  scanResult.success
                    ? 'bg-zinc-900 hover:bg-zinc-800 text-white'
                    : 'bg-white hover:bg-zinc-100 text-zinc-950'
                }`}
              >
                CLOSE OVERLAY
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
