import { z } from 'zod';
import { env } from '../../config/env.js';
import { connectRedis, redisClient } from '../../shared/cache/redis.service.js';
import {
  configureTierOnChain,
  deployEventContract,
} from '../../shared/blockchain/event-contract.service.js';
import {
  buildTierMetadata,
  pinFileToIpfs,
  pinJsonToIpfs,
  verifyIpfsHashResolvable,
} from '../../shared/ipfs/pinata.service.js';
import { parsePagination } from '../../shared/utils/pagination.js';
import { findOrganisationById } from '../org/org.repository.js';
import {
  activateTiersForEvent,
  createEvent,
  createTier,
  findEventById,
  findTierById,
  getNextTierIndex,
  getOrgWalletForEvent,
  listEventsByOrg,
  listFeaturedEvents,
  listPublishedEvents,
  listTiersByEvent,
  setEventContract,
  softDeleteEvent,
  softDeleteTier,
  updateEvent,
  updateEventStatus,
  updateTier,
} from '../event/event.repository.js';

const createEventSchema = z.object({
  name: z.string().min(2).max(255),
  description: z.string().max(10000).optional(),
  category: z.string().max(100).optional(),
  tags: z.array(z.string()).optional(),
  ageRestriction: z.number().int().min(0).max(99).optional(),
  eventDate: z.string().datetime(),
  eventEndDate: z.string().datetime().optional(),
  venueId: z.string().uuid().optional(),
  venueName: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  zones: z.unknown().optional(),
  resaleEnabled: z.boolean().optional(),
  resalePriceCapBps: z.number().int().min(0).max(100000).optional(),
  resaleRoyaltyBps: z.number().int().min(0).max(10000).optional(),
});

const updateEventSchema = createEventSchema.partial();

const createTierSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(5000).optional(),
  zone: z.string().max(100).optional(),
  totalSupply: z.number().int().min(1),
  maxPerWallet: z.number().int().min(1).max(20).optional(),
  priceWei: z.string().regex(/^\d+$/),
  priceDisplay: z.number().positive().optional(),
  saleStartAt: z.string().datetime().optional(),
  saleEndAt: z.string().datetime().optional(),
  isTransferable: z.boolean().optional(),
  royaltyBps: z.number().int().min(0).max(10000).optional(),
});

const updateTierSchema = createTierSchema.partial();

const uploadImageSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().regex(/^image\//),
  contentBase64: z.string().min(1),
});

const uploadBannerSchema = uploadImageSchema;

function draftOnly(status: string): boolean {
  return status === 'draft';
}

async function requireVerifiedOrg(orgId: string) {
  const org = await findOrganisationById(orgId);
  if (!org) return { error: 'Organisation not found', status: 404 as const };
  if (org.verificationStatus !== 'verified') {
    return {
      error: 'Organisation KYC must be verified before this action',
      status: 403 as const,
      code: 'KYC_NOT_VERIFIED' as const,
    };
  }
  return { org };
}

async function pinTierMetadata(
  event: Awaited<ReturnType<typeof findEventById>> & object,
  tier: Awaited<ReturnType<typeof findTierById>> & object,
  imageHash?: string
) {
  const resolvedImageHash =
    imageHash ?? event.imageIpfsHash ?? `placeholder_${tier.id.replace(/-/g, '')}`;

  const metadata = buildTierMetadata({
    tierName: tier.name,
    eventName: event.name,
    description: tier.description ?? `Ticket for ${event.name}`,
    imageHash: resolvedImageHash,
    eventId: event.id,
    venueName: event.venueName,
    eventDate: event.eventDate,
    zone: tier.zone,
    isTransferable: tier.isTransferable,
  });

  const metadataPin = await pinJsonToIpfs(`${tier.name}-metadata`, metadata);
  const updated = await updateTier(event.id, tier.id, {
    metadata_ipfs_hash: metadataPin.hash,
    metadata_ipfs_uri: metadataPin.uri,
  });
  return updated ?? tier;
}

async function requireDraftEvent(orgId: string, eventId: string) {
  const event = await findEventById(eventId, orgId);
  if (!event) return { error: 'Event not found', status: 404 as const };
  if (!draftOnly(event.status)) {
    return { error: 'Event can only be modified while in draft status', status: 409 as const };
  }
  return { event };
}

export async function adminListEvents(orgId: string, query: Record<string, string | undefined>) {
  const { page, limit, offset } = parsePagination(query);
  const { rows, total } = await listEventsByOrg({
    orgId,
    offset,
    limit,
    status: query.status,
  });
  return { rows, meta: { page, limit, total } };
}

export async function adminCreateEvent(
  orgId: string,
  createdById: string,
  body: unknown
) {
  const parsed = createEventSchema.safeParse(body);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .join('; ');
    return { error: details || 'Invalid request', status: 400 as const };
  }

  const org = await findOrganisationById(orgId);
  if (!org) return { error: 'Organisation not found', status: 404 as const };
  if (org.status === 'suspended' || org.status === 'inactive') {
    return { error: 'Organisation account is suspended or inactive', status: 403 as const };
  }

  const event = await createEvent({
    orgId,
    createdById,
    ...parsed.data,
    chainId: env.MST_CHAIN_ID,
  });
  return { event, status: 201 as const };
}

export async function adminGetEvent(orgId: string, eventId: string) {
  const event = await findEventById(eventId, orgId);
  if (!event) return { error: 'Event not found', status: 404 as const };
  const tiers = await listTiersByEvent(eventId);
  return { event, tiers };
}

export async function adminUpdateEvent(orgId: string, eventId: string, body: unknown) {
  const parsed = updateEventSchema.safeParse(body);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .join('; ');
    return { error: details || 'Invalid request', status: 400 as const };
  }

  const check = await requireDraftEvent(orgId, eventId);
  if ('error' in check) return check;

  const fields: Record<string, unknown> = {};
  const data = parsed.data;
  if (data.name !== undefined) fields.name = data.name;
  if (data.description !== undefined) fields.description = data.description;
  if (data.category !== undefined) fields.category = data.category;
  if (data.tags !== undefined) fields.tags = data.tags;
  if (data.ageRestriction !== undefined) fields.age_restriction = data.ageRestriction;
  if (data.eventDate !== undefined) fields.event_date = data.eventDate;
  if (data.eventEndDate !== undefined) fields.event_end_date = data.eventEndDate;
  if (data.venueId !== undefined) fields.venue_id = data.venueId;
  if (data.venueName !== undefined) fields.venue_name = data.venueName;
  if (data.city !== undefined) fields.city = data.city;
  if (data.country !== undefined) fields.country = data.country;
  if (data.latitude !== undefined) fields.latitude = data.latitude;
  if (data.longitude !== undefined) fields.longitude = data.longitude;
  if (data.zones !== undefined) fields.zones = JSON.stringify(data.zones);
  if (data.resaleEnabled !== undefined) fields.resale_enabled = data.resaleEnabled;
  if (data.resalePriceCapBps !== undefined) fields.resale_price_cap_bps = data.resalePriceCapBps;
  if (data.resaleRoyaltyBps !== undefined) fields.resale_royalty_bps = data.resaleRoyaltyBps;

  const event = await updateEvent(eventId, orgId, fields);
  if (!event) return { error: 'Event not found', status: 404 as const };
  return { event };
}

export async function adminDeleteEvent(orgId: string, eventId: string) {
  const check = await requireDraftEvent(orgId, eventId);
  if ('error' in check) return check;

  const deleted = await softDeleteEvent(eventId, orgId);
  if (!deleted) return { error: 'Event not found or not deletable', status: 404 as const };
  return { success: true };
}

export async function adminUploadEventBanner(
  orgId: string,
  eventId: string,
  body: unknown
) {
  const parsed = uploadBannerSchema.safeParse(body);
  if (!parsed.success) return { error: 'Invalid upload payload', status: 400 as const };

  const check = await requireDraftEvent(orgId, eventId);
  if ('error' in check) return check;

  const buffer = Buffer.from(parsed.data.contentBase64, 'base64');
  const pinned = await pinFileToIpfs(parsed.data.fileName, buffer, parsed.data.mimeType);

  const event = await updateEvent(eventId, orgId, {
    image_ipfs_hash: pinned.hash,
    image_ipfs_url: pinned.gatewayUrl,
  });
  if (!event) return { error: 'Event not found', status: 404 as const };
  return { event, ipfs: pinned };
}

export async function adminListTiers(orgId: string, eventId: string) {
  const event = await findEventById(eventId, orgId);
  if (!event) return { error: 'Event not found', status: 404 as const };
  const tiers = await listTiersByEvent(eventId);
  return { tiers };
}

export async function adminCreateTier(orgId: string, eventId: string, body: unknown) {
  const parsed = createTierSchema.safeParse(body);
  if (!parsed.success) return { error: 'Invalid tier request', status: 400 as const };

  const check = await requireDraftEvent(orgId, eventId);
  if ('error' in check) return check;

  const tierIndex = await getNextTierIndex(eventId);
  const tier = await createTier({
    eventId,
    tierIndex,
    ...parsed.data,
  });

  const tierWithMetadata = await pinTierMetadata(check.event, tier);
  return { tier: tierWithMetadata, status: 201 as const };
}

export async function adminUpdateTier(
  orgId: string,
  eventId: string,
  tierId: string,
  body: unknown
) {
  const parsed = updateTierSchema.safeParse(body);
  if (!parsed.success) return { error: 'Invalid tier request', status: 400 as const };

  const check = await requireDraftEvent(orgId, eventId);
  if ('error' in check) return check;

  const fields: Record<string, unknown> = {};
  const data = parsed.data;
  if (data.name !== undefined) fields.name = data.name;
  if (data.description !== undefined) fields.description = data.description;
  if (data.zone !== undefined) fields.zone = data.zone;
  if (data.totalSupply !== undefined) fields.total_supply = data.totalSupply;
  if (data.maxPerWallet !== undefined) fields.max_per_wallet = data.maxPerWallet;
  if (data.priceWei !== undefined) fields.price_wei = data.priceWei;
  if (data.priceDisplay !== undefined) fields.price_display = data.priceDisplay;
  if (data.saleStartAt !== undefined) fields.sale_start_at = data.saleStartAt;
  if (data.saleEndAt !== undefined) fields.sale_end_at = data.saleEndAt;
  if (data.isTransferable !== undefined) fields.is_transferable = data.isTransferable;
  if (data.royaltyBps !== undefined) fields.royalty_bps = data.royaltyBps;

  const tier = await updateTier(eventId, tierId, fields);
  if (!tier) return { error: 'Tier not found', status: 404 as const };
  return { tier };
}

export async function adminDeleteTier(orgId: string, eventId: string, tierId: string) {
  const check = await requireDraftEvent(orgId, eventId);
  if ('error' in check) return check;

  const deleted = await softDeleteTier(eventId, tierId);
  if (!deleted) return { error: 'Tier not found', status: 404 as const };
  return { success: true };
}

export async function adminUploadTierImage(
  orgId: string,
  eventId: string,
  tierId: string,
  body: unknown
) {
  const parsed = uploadImageSchema.safeParse(body);
  if (!parsed.success) return { error: 'Invalid upload payload', status: 400 as const };

  const check = await requireDraftEvent(orgId, eventId);
  if ('error' in check) return check;

  const tier = await findTierById(eventId, tierId);
  if (!tier) return { error: 'Tier not found', status: 404 as const };

  const event = check.event;
  const buffer = Buffer.from(parsed.data.contentBase64, 'base64');
  const imagePin = await pinFileToIpfs(parsed.data.fileName, buffer, parsed.data.mimeType);
  const updated = await pinTierMetadata(event, tier, imagePin.hash);
  if (!updated) return { error: 'Tier not found', status: 404 as const };

  return {
    tier: updated,
    image: imagePin,
  };
}

export async function adminDeployEvent(orgId: string, eventId: string) {
  const check = await requireDraftEvent(orgId, eventId);
  if ('error' in check) return check;

  const orgCheck = await requireVerifiedOrg(orgId);
  if ('error' in orgCheck) {
    return {
      error: 'Organisation KYC must be verified before deploying events on-chain',
      status: orgCheck.status,
      code: orgCheck.code,
    };
  }

  const event = check.event;
  if (event.contractAddress) {
    return { error: 'Contract already deployed for this event', status: 409 as const };
  }

  const tiers = await listTiersByEvent(eventId);
  if (tiers.length === 0) {
    return { error: 'Add at least one ticket tier before deploying', status: 400 as const };
  }

  for (const tier of tiers) {
    if (!tier.metadataIpfsHash) {
      return {
        error: `Tier "${tier.name}" is missing IPFS metadata — upload an image first`,
        status: 400 as const,
      };
    }
  }

  const orgWallet = await getOrgWalletForEvent(orgId);
  if (!orgWallet) return { error: 'Organisation wallet not found', status: 404 as const };

  const baseUri = `${env.PINATA_GATEWAY}/ipfs/`;
  const deployment = await deployEventContract({
    orgWallet,
    eventId: event.id,
    baseUri,
  });

  for (const tier of tiers) {
    await configureTierOnChain({
      contractAddress: deployment.address,
      tierIndex: tier.tierIndex,
      supply: tier.totalSupply,
      priceWei: tier.priceWei,
      isTransferable: tier.isTransferable,
      royaltyBps: tier.royaltyBps,
    });
  }

  const updated = await setEventContract(eventId, orgId, {
    contractAddress: deployment.address,
    deploymentTx: deployment.txHash,
  });
  if (!updated) return { error: 'Failed to save contract address', status: 500 as const };

  return { event: updated, deployment };
}

export async function adminPublishEvent(orgId: string, eventId: string) {
  const orgCheck = await requireVerifiedOrg(orgId);
  if ('error' in orgCheck) {
    return {
      error: 'Organisation KYC must be verified before releasing tickets for sale',
      status: orgCheck.status,
      code: orgCheck.code,
    };
  }

  const event = await findEventById(eventId, orgId);
  if (!event) return { error: 'Event not found', status: 404 as const };
  if (event.status !== 'draft') {
    return { error: 'Only draft events can be published', status: 409 as const };
  }
  if (!event.contractAddress) {
    return { error: 'Deploy the smart contract before publishing', status: 400 as const };
  }

  const tiers = await listTiersByEvent(eventId);
  if (tiers.length === 0) {
    return { error: 'Event must have at least one tier', status: 400 as const };
  }

  for (const tier of tiers) {
    if (!tier.metadataIpfsHash) {
      return { error: `Tier "${tier.name}" is missing IPFS metadata`, status: 400 as const };
    }
    const resolvable = await verifyIpfsHashResolvable(tier.metadataIpfsHash);
    if (!resolvable) {
      return {
        error: `Tier "${tier.name}" metadata CID is not resolvable via IPFS gateway`,
        status: 400 as const,
      };
    }
  }

  await activateTiersForEvent(eventId);
  const published = await updateEventStatus(eventId, orgId, 'published', { publishedAt: true });
  if (!published) return { error: 'Failed to publish event', status: 500 as const };

  await connectRedis();
  for (const tier of tiers) {
    const available = tier.totalSupply - tier.minted;
    await redisClient.set(`tier:available:${tier.id}`, String(available));
  }

  return { event: published };
}

export async function adminGoLiveEvent(orgId: string, eventId: string) {
  const event = await findEventById(eventId, orgId);
  if (!event) return { error: 'Event not found', status: 404 as const };
  if (event.status !== 'published') {
    return { error: 'Event must be published before going live', status: 409 as const };
  }

  const updated = await updateEventStatus(eventId, orgId, 'live');
  if (!updated) return { error: 'Failed to update event', status: 500 as const };
  return { event: updated };
}

export async function adminEndEvent(orgId: string, eventId: string) {
  const event = await findEventById(eventId, orgId);
  if (!event) return { error: 'Event not found', status: 404 as const };
  if (event.status !== 'live' && event.status !== 'published') {
    return { error: 'Event must be published or live to end', status: 409 as const };
  }

  const updated = await updateEventStatus(eventId, orgId, 'ended', { endedAt: true });
  if (!updated) return { error: 'Failed to end event', status: 500 as const };
  return { event: updated };
}

export async function adminCancelEvent(orgId: string, eventId: string) {
  const event = await findEventById(eventId, orgId);
  if (!event) return { error: 'Event not found', status: 404 as const };
  if (event.status === 'ended' || event.status === 'cancelled') {
    return { error: 'Event cannot be cancelled', status: 409 as const };
  }

  const updated = await updateEventStatus(eventId, orgId, 'cancelled');
  if (!updated) return { error: 'Failed to cancel event', status: 500 as const };
  return { event: updated };
}

export async function browseFeaturedEvents() {
  const rows = await listFeaturedEvents(8);
  return { rows };
}

export async function browseEvents(query: Record<string, string | undefined>) {
  const { page, limit, offset } = parsePagination(query);
  const { rows, total } = await listPublishedEvents({
    offset,
    limit,
    city: query.city,
    category: query.category,
    search: query.q,
    sort: query.sort,
  });
  return { rows, meta: { page, limit, total } };
}

export async function browseEventDetail(eventId: string) {
  const event = await findEventById(eventId);
  if (!event || (event.status !== 'published' && event.status !== 'live')) {
    return { error: 'Event not found', status: 404 as const };
  }
  const tiers = await listTiersByEvent(eventId);
  const activeTiers = tiers.filter((t) => t.status === 'active' || t.status === 'sold_out');
  return { event, tiers: activeTiers };
}

export {
  createEventSchema,
  createTierSchema,
  updateEventSchema,
  updateTierSchema,
};
