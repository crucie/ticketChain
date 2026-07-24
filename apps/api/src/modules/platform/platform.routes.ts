import { Router } from 'express';
import { authenticateJWT, requirePlatformAdmin } from '../../middleware/auth.js';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import {
  createOrganisationHandler,
  deleteOrganisationHandler,
  getOrganisationHandler,
  listOrganisationsHandler,
  updateOrganisationHandler,
  updateOrganisationStatusHandler,
  verifyOrganisationHandler,
} from './platform-org.controller.js';
import {
  approveSettlementHandler,
  blacklistHandler,
  getKpisHandler,
  listAuditHandler,
  listFraudHandler,
  listSettlementsHandler,
} from './platform-finance.controller.js';
import {
  getBlockchainHealth,
  listPlatformAdmins,
  listPlatformEvents,
  listPlatformRefunds,
  listPlatformTickets,
  reviewPlatformRefund,
} from './platform-catalog.service.js';

const router = Router();

router.use(authenticateJWT, requirePlatformAdmin);

router.get(
  '/organisations',
  asyncHandler(async (req, res) => {
    await listOrganisationsHandler(req, res);
  })
);

router.post(
  '/organisations',
  asyncHandler(async (req, res) => {
    await createOrganisationHandler(req, res);
  })
);

router.get(
  '/organisations/:orgId',
  asyncHandler(async (req, res) => {
    await getOrganisationHandler(req, res);
  })
);

router.patch(
  '/organisations/:orgId',
  asyncHandler(async (req, res) => {
    await updateOrganisationHandler(req, res);
  })
);

router.delete(
  '/organisations/:orgId',
  asyncHandler(async (req, res) => {
    await deleteOrganisationHandler(req, res);
  })
);

router.patch(
  '/organisations/:orgId/status',
  asyncHandler(async (req, res) => {
    await updateOrganisationStatusHandler(req, res);
  })
);

router.patch(
  '/organisations/:orgId/verify',
  asyncHandler(async (req, res) => {
    await verifyOrganisationHandler(req, res);
  })
);

router.get(
  '/kpis',
  asyncHandler(async (req, res) => {
    await getKpisHandler(req, res);
  })
);

router.get(
  '/settlements',
  asyncHandler(async (req, res) => {
    await listSettlementsHandler(req, res);
  })
);

router.post(
  '/settlements/:settlementId/approve',
  asyncHandler(async (req, res) => {
    await approveSettlementHandler(req, res);
  })
);

router.get(
  '/fraud',
  asyncHandler(async (req, res) => {
    await listFraudHandler(req, res);
  })
);

router.post(
  '/fraud/blacklist',
  asyncHandler(async (req, res) => {
    await blacklistHandler(req, res);
  })
);

router.get(
  '/audit',
  asyncHandler(async (req, res) => {
    await listAuditHandler(req, res);
  })
);

router.get(
  '/events',
  asyncHandler(async (req, res) => {
    const result = await listPlatformEvents(req.query as Record<string, string | undefined>);
    res.json({ success: true, data: result.rows, meta: result.meta });
  })
);

router.get(
  '/tickets',
  asyncHandler(async (req, res) => {
    const result = await listPlatformTickets(req.query as Record<string, string | undefined>);
    res.json({ success: true, data: result.rows, meta: result.meta });
  })
);

router.get(
  '/admins',
  asyncHandler(async (_req, res) => {
    const data = await listPlatformAdmins();
    res.json({ success: true, data });
  })
);

router.get(
  '/refunds',
  asyncHandler(async (_req, res) => {
    const data = await listPlatformRefunds();
    res.json({ success: true, data });
  })
);

router.patch(
  '/refunds/:refundId/review',
  asyncHandler(async (req, res) => {
    const { action } = req.body as { action?: 'approve' | 'reject' };
    if (!action) {
      res.status(400).json({ success: false, error: 'action required' });
      return;
    }
    const result = await reviewPlatformRefund(
      req.params.refundId as string,
      action,
      req.user?.userId ?? ''
    );
    if ('error' in result) {
      res.status(result.status ?? 400).json({ success: false, error: result.error });
      return;
    }
    res.json({ success: true });
  })
);

router.get(
  '/blockchain/health',
  asyncHandler(async (_req, res) => {
    const data = await getBlockchainHealth();
    res.json({ success: true, data });
  })
);

export default router;
