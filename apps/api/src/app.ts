import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { checkDatabaseConnection } from './shared/db/postgres.service.js';
import { checkRedisConnection } from './shared/cache/redis.service.js';
import { checkMstRpcConnection } from './shared/blockchain/mst.service.js';
import { ensureJwtKeysExist } from './modules/auth/token.service.js';
import authRoutes from './modules/auth/auth.routes.js';
import platformRoutes from './modules/platform/platform.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import eventsRoutes from './modules/events/events.routes.js';
import ticketsRoutes from './modules/tickets/tickets.routes.js';
import webhooksRoutes from './modules/payments/webhooks.routes.js';
import orgRoutes from './modules/org/org.routes.js';
import volunteerRoutes from './modules/volunteer/volunteer.routes.js';
import marketplaceRoutes from './modules/marketplace/marketplace.routes.js';
import profileRoutes from './modules/profile/profile.routes.js';

ensureJwtKeysExist();

process.on('unhandledRejection', (reason) => {
  console.error('[api] unhandledRejection (process kept alive):', reason);
});

function resolveCorsOrigin(): cors.CorsOptions['origin'] {
  const configured = new Set<string>([env.FRONTEND_URL]);

  if (env.NODE_ENV === 'development') {
    configured.add('http://localhost:3000');
    configured.add('http://127.0.0.1:3000');
  }

  const allowed = [...configured];

  return (origin, callback) => {
    // Same-origin or server-to-server requests may omit Origin
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowed.includes(origin)) {
      callback(null, true);
      return;
    }

    // Allow LAN dev hosts like http://192.168.1.41:3000
    if (
      env.NODE_ENV === 'development' &&
      /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(origin)
    ) {
      callback(null, true);
      return;
    }

    callback(null, false);
  };
}

const app = express();

app.use(
  pinoHttp({
    level: env.LOG_LEVEL,
  })
);
app.use(
  cors({
    origin: resolveCorsOrigin(),
    credentials: true,
  })
);
// Base64 image uploads need a larger JSON body than Express's 100kb default.
app.use(express.json({ limit: '15mb' }));
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/platform', platformRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', eventsRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/orgs', orgRoutes);
app.use('/api/volunteer', volunteerRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/profile', profileRoutes);

app.use((err: Error & { type?: string }, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.type === 'entity.too.large') {
    res.status(413).json({ success: false, error: 'Upload too large (max 15MB)' });
    return;
  }
  console.error('[api] unhandled error:', err);
  if (!res.headersSent) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
  next(err);
});

app.get('/health', async (_req, res) => {
  const [dbOk, redisOk, mst] = await Promise.all([
    checkDatabaseConnection().catch(() => false),
    checkRedisConnection().catch(() => false),
    checkMstRpcConnection(),
  ]);

  const healthy = dbOk && redisOk;
  const status = healthy ? 'ok' : 'degraded';

  res.status(healthy ? 200 : 503).json({
    success: healthy,
    status,
    timestamp: new Date().toISOString(),
    services: {
      database: dbOk ? 'up' : 'down',
      redis: redisOk ? 'up' : 'down',
      mstRpc: mst.ok ? 'up' : 'down',
      mstBlockNumber: mst.blockNumber ?? null,
    },
  });
});

app.get('/', (_req, res) => {
  res.json({
    name: 'TicketChain MST API',
    version: '0.1.0',
    docs: '/health',
    auth: {
      verify: 'POST /api/auth/verify',
      me: 'GET /api/auth/me',
      refresh: 'POST /api/auth/refresh',
      logout: 'POST /api/auth/logout',
      acceptInvite: 'POST /api/auth/accept-invite',
    },
    platform: {
      organisations: 'GET/POST /api/platform/organisations',
    },
    admin: {
      organisation: 'GET/PATCH /api/admin/organisation',
      members: 'GET /api/admin/members',
      invite: 'POST /api/admin/members/invite',
      events: 'GET/POST /api/admin/events',
    },
    events: {
      browse: 'GET /api/events',
      detail: 'GET /api/events/:eventId',
    },
    tickets: {
      checkout: 'POST /api/tickets/checkout',
      mint: 'POST /api/tickets/mint (dev/direct only)',
      order: 'GET /api/tickets/orders/:orderId',
      mine: 'GET /api/tickets',
      qr: 'GET /api/tickets/:ticketId/qr',
    },
    webhooks: {
      chainpay: 'POST /api/webhooks/chainpay?order_id=',
      payments: 'POST /api/webhooks/payments?order_id=&provider=',
    },
    orgs: {
      mine: 'GET /api/orgs/me',
      profile: 'GET /api/orgs/:orgId',
      bySlug: 'GET /api/orgs/slug/:slug',
      acceptInvite: 'POST /api/orgs/accept-invite',
    },
    volunteer: {
      verifyCheckin: 'POST /api/volunteer/checkin/verify',
      events: 'GET /api/volunteer/events',
      eventDetail: 'GET /api/volunteer/events/:eventId',
      checkinStats: 'GET /api/volunteer/checkin/stats?eventId=',
      checkinHistory: 'GET /api/volunteer/checkin/history?eventId=&page=&limit=',
      offlineSnapshot: 'GET /api/volunteer/checkin/offline-snapshot?eventId=',
    },
    marketplace: {
      list: 'GET /api/marketplace',
      buy: 'POST /api/marketplace/:listingId/buy',
    },
    profile: {
      rewards: 'GET /api/profile/rewards',
      referral: 'GET /api/profile/referral',
      wallet: 'GET /api/profile/wallet',
      faucet: 'POST /api/profile/faucet',
    },
    platformFinance: {
      kpis: 'GET /api/platform/kpis',
      settlements: 'GET /api/platform/settlements',
      approveSettlement: 'POST /api/platform/settlements/:settlementId/approve',
      fraud: 'GET /api/platform/fraud',
      blacklist: 'POST /api/platform/fraud/blacklist',
      audit: 'GET /api/platform/audit',
    },
  });
});

// Catch errors from route handlers so the process stays up in dev
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[api] route error:', err);
  if (!res.headersSent) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

const port = env.PORT;

const isDirectRun =
  process.argv[1]?.includes('app.ts') || process.argv[1]?.includes('app.js');

if (isDirectRun) {
  app.listen(port, () => {
    console.log(`TicketChain API listening on http://localhost:${port}`);
  });
}

export default app;
