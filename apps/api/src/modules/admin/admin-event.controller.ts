import type { Request, Response } from 'express';
import {
  adminCancelEvent,
  adminCreateEvent,
  adminCreateTier,
  adminDeleteEvent,
  adminDeleteTier,
  adminDeployEvent,
  adminEndEvent,
  adminGetEvent,
  adminGoLiveEvent,
  adminListEvents,
  adminListTiers,
  adminPublishEvent,
  adminUpdateEvent,
  adminUpdateTier,
  adminUploadEventBanner,
  adminUploadTierImage,
} from './admin-event.service.js';
import {
  adminGetEventAnalytics,
  adminListEventCheckins,
  adminListEventTickets,
  adminListEventVolunteers,
  adminAssignEventVolunteer,
  adminRevokeEventVolunteer,
} from './admin-event-insights.service.js';

export async function listEventsHandler(req: Request, res: Response): Promise<void> {
  const result = await adminListEvents(req.orgId!, req.query as Record<string, string | undefined>);
  res.json({ success: true, data: result.rows, meta: result.meta });
}

export async function createEventHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }
  const result = await adminCreateEvent(req.orgId!, req.user.userId, req.body);
  if ('error' in result) {
    res.status(result.status ?? 400).json({ success: false, error: result.error });
    return;
  }
  res.status(result.status).json({ success: true, data: result.event });
}

export async function getEventHandler(req: Request, res: Response): Promise<void> {
  const result = await adminGetEvent(req.orgId!, req.params.eventId as string);
  if ('error' in result) {
    res.status(result.status ?? 404).json({ success: false, error: result.error });
    return;
  }
  res.json({ success: true, data: { ...result.event, tiers: result.tiers } });
}

export async function updateEventHandler(req: Request, res: Response): Promise<void> {
  const result = await adminUpdateEvent(req.orgId!, req.params.eventId as string, req.body);
  if ('error' in result) {
    res.status(result.status ?? 400).json({ success: false, error: result.error });
    return;
  }
  res.json({ success: true, data: result.event });
}

export async function deleteEventHandler(req: Request, res: Response): Promise<void> {
  const result = await adminDeleteEvent(req.orgId!, req.params.eventId as string);
  if ('error' in result) {
    res.status(result.status ?? 404).json({ success: false, error: result.error });
    return;
  }
  res.json({ success: true });
}

export async function uploadBannerHandler(req: Request, res: Response): Promise<void> {
  const result = await adminUploadEventBanner(req.orgId!, req.params.eventId as string, req.body);
  if ('error' in result) {
    res.status(result.status ?? 400).json({ success: false, error: result.error });
    return;
  }
  res.json({ success: true, data: result.event });
}

export async function deployEventHandler(req: Request, res: Response): Promise<void> {
  try {
    const result = await adminDeployEvent(req.orgId!, req.params.eventId as string);
    if ('error' in result) {
      res.status(result.status ?? 400).json({ success: false, error: result.error });
      return;
    }
    res.json({
      success: true,
      data: result.event,
      deployment: 'deployment' in result ? result.deployment : undefined,
    });
  } catch (error) {
    console.error('[admin/deploy] failed:', error);
    const message = error instanceof Error ? error.message : 'Contract deployment failed';
    res.status(500).json({ success: false, error: message });
  }
}

export async function publishEventHandler(req: Request, res: Response): Promise<void> {
  const result = await adminPublishEvent(req.orgId!, req.params.eventId as string);
  if ('error' in result) {
    res.status(result.status ?? 400).json({ success: false, error: result.error });
    return;
  }
  res.json({ success: true, data: result.event });
}

export async function goLiveEventHandler(req: Request, res: Response): Promise<void> {
  const result = await adminGoLiveEvent(req.orgId!, req.params.eventId as string);
  if ('error' in result) {
    res.status(result.status ?? 400).json({ success: false, error: result.error });
    return;
  }
  res.json({ success: true, data: result.event });
}

export async function endEventHandler(req: Request, res: Response): Promise<void> {
  const result = await adminEndEvent(req.orgId!, req.params.eventId as string);
  if ('error' in result) {
    res.status(result.status ?? 400).json({ success: false, error: result.error });
    return;
  }
  res.json({ success: true, data: result.event });
}

export async function cancelEventHandler(req: Request, res: Response): Promise<void> {
  const result = await adminCancelEvent(req.orgId!, req.params.eventId as string);
  if ('error' in result) {
    res.status(result.status ?? 400).json({ success: false, error: result.error });
    return;
  }
  res.json({ success: true, data: result.event });
}

export async function listTiersHandler(req: Request, res: Response): Promise<void> {
  const result = await adminListTiers(req.orgId!, req.params.eventId as string);
  if ('error' in result) {
    res.status(result.status ?? 404).json({ success: false, error: result.error });
    return;
  }
  res.json({ success: true, data: result.tiers });
}

export async function createTierHandler(req: Request, res: Response): Promise<void> {
  const result = await adminCreateTier(req.orgId!, req.params.eventId as string, req.body);
  if ('error' in result) {
    res.status(result.status ?? 400).json({ success: false, error: result.error });
    return;
  }
  if (!('tier' in result)) {
    res.status(500).json({ success: false, error: 'Unexpected response' });
    return;
  }
  res.status(result.status ?? 201).json({ success: true, data: result.tier });
}

export async function updateTierHandler(req: Request, res: Response): Promise<void> {
  const result = await adminUpdateTier(
    req.orgId!,
    req.params.eventId as string,
    req.params.tierId as string,
    req.body
  );
  if ('error' in result) {
    res.status(result.status ?? 400).json({ success: false, error: result.error });
    return;
  }
  if (!('tier' in result)) {
    res.status(500).json({ success: false, error: 'Unexpected response' });
    return;
  }
  res.json({ success: true, data: result.tier });
}

export async function deleteTierHandler(req: Request, res: Response): Promise<void> {
  const result = await adminDeleteTier(
    req.orgId!,
    req.params.eventId as string,
    req.params.tierId as string
  );
  if ('error' in result) {
    res.status(result.status ?? 404).json({ success: false, error: result.error });
    return;
  }
  res.json({ success: true });
}

export async function getEventAnalyticsHandler(req: Request, res: Response): Promise<void> {
  const result = await adminGetEventAnalytics(req.orgId!, req.params.eventId as string);
  if ('error' in result) {
    res.status(result.status ?? 404).json({ success: false, error: result.error });
    return;
  }
  res.json({ success: true, data: result.analytics });
}

export async function listEventTicketsHandler(req: Request, res: Response): Promise<void> {
  const result = await adminListEventTickets(
    req.orgId!,
    req.params.eventId as string,
    req.query as Record<string, string | undefined>
  );
  if ('error' in result) {
    res.status(result.status ?? 404).json({ success: false, error: result.error });
    return;
  }
  res.json({ success: true, data: result.rows, meta: result.meta });
}

export async function listEventCheckinsHandler(req: Request, res: Response): Promise<void> {
  const result = await adminListEventCheckins(
    req.orgId!,
    req.params.eventId as string,
    req.query as Record<string, string | undefined>
  );
  if ('error' in result) {
    res.status(result.status ?? 404).json({ success: false, error: result.error });
    return;
  }
  res.json({ success: true, data: result.rows, meta: result.meta });
}

export async function listEventVolunteersHandler(req: Request, res: Response): Promise<void> {
  const result = await adminListEventVolunteers(req.orgId!, req.params.eventId as string);
  if ('error' in result) {
    res.status(result.status ?? 404).json({ success: false, error: result.error });
    return;
  }
  res.json({ success: true, data: result.volunteers });
}

export async function assignEventVolunteerHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }
  const result = await adminAssignEventVolunteer(
    req.orgId!,
    req.params.eventId as string,
    req.user.userId,
    req.body
  );
  if ('error' in result) {
    res.status(result.status ?? 400).json({ success: false, error: result.error });
    return;
  }
  res.status(result.status ?? 201).json({ success: true, data: result.assignment });
}

export async function revokeEventVolunteerHandler(req: Request, res: Response): Promise<void> {
  const result = await adminRevokeEventVolunteer(
    req.orgId!,
    req.params.eventId as string,
    req.params.userId as string
  );
  if ('error' in result) {
    res.status(result.status ?? 404).json({ success: false, error: result.error });
    return;
  }
  res.json({ success: true });
}

export async function uploadTierImageHandler(req: Request, res: Response): Promise<void> {
  const result = await adminUploadTierImage(
    req.orgId!,
    req.params.eventId as string,
    req.params.tierId as string,
    req.body
  );
  if ('error' in result) {
    res.status(result.status ?? 400).json({ success: false, error: result.error });
    return;
  }
  if (!('tier' in result)) {
    res.status(500).json({ success: false, error: 'Unexpected response' });
    return;
  }
  res.json({
    success: true,
    data: result.tier,
    ipfs: { image: result.image },
  });
}
