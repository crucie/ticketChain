import { Router } from 'express';
import { ROLES } from '@ticketchain/shared';
import {
  authenticateJWT,
  requireMinRole,
  requireOrgMembership,
  resolveOrgContext,
} from '../../middleware/auth.js';
import {
  cancelEventHandler,
  createEventHandler,
  createTierHandler,
  deleteEventHandler,
  deleteTierHandler,
  deployEventHandler,
  endEventHandler,
  getEventHandler,
  goLiveEventHandler,
  listEventsHandler,
  listTiersHandler,
  publishEventHandler,
  updateEventHandler,
  updateTierHandler,
  uploadBannerHandler,
  uploadTierImageHandler,
  getEventAnalyticsHandler,
  listEventCheckinsHandler,
  listEventTicketsHandler,
  listEventVolunteersHandler,
  assignEventVolunteerHandler,
  revokeEventVolunteerHandler,
} from './admin-event.controller.js';
import {
  getOrganisationHandler,
  inviteMemberHandler,
  listInvitesHandler,
  listMembersHandler,
  removeMemberHandler,
  submitKycHandler,
  updateMemberHandler,
  updateOrganisationHandler,
  uploadOrgAssetHandler,
} from './admin-org.controller.js';
import {
  confirmWalletHandler,
  getOnboardingStatusHandler,
} from './admin-onboarding.controller.js';
import { getOrgEarnings } from './admin-finance.service.js';
import {
  createVenueHandler,
  deleteVenueHandler,
  listVenuesHandler,
  updateVenueHandler,
} from './admin-venue.controller.js';
import {
  createPromoCodeHandler,
  deletePromoCodeHandler,
  listPromoCodesHandler,
  updatePromoCodeHandler,
} from './admin-promo.controller.js';
import { listFraudAlerts } from '../../shared/fraud/fraud.service.js';
import { listAuditLogs } from '../../shared/audit/audit-log.service.js';

const router = Router();

router.use(authenticateJWT, resolveOrgContext, requireOrgMembership, requireMinRole(ROLES.ADMIN));

router.get('/organisation', (req, res) => {
  void getOrganisationHandler(req, res);
});

router.get('/onboarding/status', (req, res) => {
  void getOnboardingStatusHandler(req, res);
});

router.post('/onboarding/confirm-wallet', requireMinRole(ROLES.SUPER_ADMIN), (req, res) => {
  void confirmWalletHandler(req, res);
});

router.post('/organisation/upload-asset', (req, res) => {
  void uploadOrgAssetHandler(req, res);
});

router.get('/venues', (req, res) => {
  void listVenuesHandler(req, res);
});

router.post('/venues', (req, res) => {
  void createVenueHandler(req, res);
});

router.patch('/venues/:venueId', (req, res) => {
  void updateVenueHandler(req, res);
});

router.delete('/venues/:venueId', (req, res) => {
  void deleteVenueHandler(req, res);
});

router.get('/promo-codes', (req, res) => {
  void listPromoCodesHandler(req, res);
});

router.post('/promo-codes', (req, res) => {
  void createPromoCodeHandler(req, res);
});

router.patch('/promo-codes/:promoId', (req, res) => {
  void updatePromoCodeHandler(req, res);
});

router.delete('/promo-codes/:promoId', (req, res) => {
  void deletePromoCodeHandler(req, res);
});

router.get('/fraud-logs', (_req, res) => {
  void (async () => {
    const data = await listFraudAlerts({ limit: 100, offset: 0 });
    res.json({ success: true, data });
  })();
});

router.get('/audit-logs', (_req, res) => {
  void (async () => {
    const result = await listAuditLogs({ limit: 100, offset: 0 });
    res.json({ success: true, data: result.rows });
  })();
});

router.get('/finance/earnings', (req, res) => {
  void (async () => {
    if (!req.orgId) {
      res.status(403).json({ success: false, error: 'No organisation context' });
      return;
    }
    const data = await getOrgEarnings(req.orgId);
    res.json({ success: true, data });
  })();
});

router.patch('/organisation', requireMinRole(ROLES.SUPER_ADMIN), (req, res) => {
  void updateOrganisationHandler(req, res);
});

router.patch('/organisation/kyc', requireMinRole(ROLES.SUPER_ADMIN), (req, res) => {
  void submitKycHandler(req, res);
});

router.get('/members', (req, res) => {
  void listMembersHandler(req, res);
});

router.post('/members/invite', (req, res) => {
  void inviteMemberHandler(req, res);
});

router.get('/members/invites', (req, res) => {
  void listInvitesHandler(req, res);
});

router.patch('/members/:memberId', (req, res) => {
  void updateMemberHandler(req, res);
});

router.delete('/members/:memberId', (req, res) => {
  void removeMemberHandler(req, res);
});

router.get('/events', (req, res) => {
  void listEventsHandler(req, res);
});

router.post('/events', (req, res) => {
  void createEventHandler(req, res);
});

router.get('/events/:eventId', (req, res) => {
  void getEventHandler(req, res);
});

router.patch('/events/:eventId', (req, res) => {
  void updateEventHandler(req, res);
});

router.delete('/events/:eventId', requireMinRole(ROLES.SUPER_ADMIN), (req, res) => {
  void deleteEventHandler(req, res);
});

router.post('/events/:eventId/upload-banner', (req, res) => {
  void uploadBannerHandler(req, res);
});

router.post('/events/:eventId/deploy', (req, res) => {
  void deployEventHandler(req, res);
});

router.post('/events/:eventId/publish', (req, res) => {
  void publishEventHandler(req, res);
});

router.post('/events/:eventId/go-live', (req, res) => {
  void goLiveEventHandler(req, res);
});

router.post('/events/:eventId/end', (req, res) => {
  void endEventHandler(req, res);
});

router.post('/events/:eventId/cancel', (req, res) => {
  void cancelEventHandler(req, res);
});

router.get('/events/:eventId/tiers', (req, res) => {
  void listTiersHandler(req, res);
});

router.post('/events/:eventId/tiers', (req, res) => {
  void createTierHandler(req, res);
});

router.patch('/events/:eventId/tiers/:tierId', (req, res) => {
  void updateTierHandler(req, res);
});

router.delete('/events/:eventId/tiers/:tierId', (req, res) => {
  void deleteTierHandler(req, res);
});

router.post('/events/:eventId/tiers/:tierId/upload-image', (req, res) => {
  void uploadTierImageHandler(req, res);
});

router.get('/events/:eventId/analytics', (req, res) => {
  void getEventAnalyticsHandler(req, res);
});

router.get('/events/:eventId/tickets', (req, res) => {
  void listEventTicketsHandler(req, res);
});

router.get('/events/:eventId/checkins', (req, res) => {
  void listEventCheckinsHandler(req, res);
});

router.get('/events/:eventId/volunteers', (req, res) => {
  void listEventVolunteersHandler(req, res);
});

router.post('/events/:eventId/volunteers', (req, res) => {
  void assignEventVolunteerHandler(req, res);
});

router.delete('/events/:eventId/volunteers/:userId', (req, res) => {
  void revokeEventVolunteerHandler(req, res);
});

export default router;
