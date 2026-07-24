import { pool } from '../../shared/db/postgres.service.js';
import type { EventDetail, EventSummary, TierResponse } from '@ticketchain/shared';

interface EventRow {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  image_ipfs_hash: string | null;
  image_ipfs_url: string | null;
  category: string | null;
  tags: string[] | null;
  age_restriction: number | null;
  event_date: Date;
  event_end_date: Date | null;
  venue_id: string | null;
  venue_name: string | null;
  city: string | null;
  country: string | null;
  latitude: string | null;
  longitude: string | null;
  zones: unknown;
  contract_address: string | null;
  contract_deployment_tx: string | null;
  chain_id: number;
  resale_enabled: boolean;
  resale_price_cap_bps: number | null;
  resale_royalty_bps: number | null;
  status: string;
  total_tickets_sold: number;
  total_revenue_wei: string;
  total_checked_in: number;
  created_at: Date;
  updated_at: Date;
  published_at: Date | null;
  ended_at: Date | null;
}

interface TierRow {
  id: string;
  event_id: string;
  tier_index: number;
  name: string;
  description: string | null;
  zone: string | null;
  total_supply: number;
  minted: number;
  max_per_wallet: number;
  price_wei: string;
  price_display: string | null;
  sale_start_at: Date | null;
  sale_end_at: Date | null;
  early_bird_end_at: Date | null;
  early_bird_price_wei: string | null;
  is_transferable: boolean;
  royalty_bps: number;
  metadata_ipfs_hash: string | null;
  metadata_ipfs_uri: string | null;
  resale_enabled: boolean | null;
  resale_price_cap_bps: number | null;
  status: string;
  created_at: Date;
}

const EVENT_SELECT = `
  id, org_id, name, description, image_ipfs_hash, image_ipfs_url, category, tags,
  age_restriction, event_date, event_end_date, venue_id, venue_name, city, country,
  latitude, longitude, zones, contract_address, contract_deployment_tx, chain_id,
  resale_enabled, resale_price_cap_bps, resale_royalty_bps, status, total_tickets_sold,
  total_revenue_wei, total_checked_in, created_at, updated_at, published_at, ended_at
`;

const TIER_SELECT = `
  id, event_id, tier_index, name, description, zone, total_supply, minted, max_per_wallet,
  price_wei, price_display, sale_start_at, sale_end_at, early_bird_end_at, early_bird_price_wei,
  is_transferable, royalty_bps, metadata_ipfs_hash, metadata_ipfs_uri, resale_enabled,
  resale_price_cap_bps, status, created_at
`;

function mapEventSummary(row: EventRow): EventSummary {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    category: row.category,
    city: row.city,
    country: row.country,
    eventDate: row.event_date.toISOString(),
    status: row.status as EventSummary['status'],
    imageIpfsUrl: row.image_ipfs_url,
    totalTicketsSold: row.total_tickets_sold,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    contractAddress: row.contract_address,
    totalCheckedIn: row.total_checked_in,
    totalRevenueWei: row.total_revenue_wei,
  };
}

function mapEventDetail(row: EventRow): EventDetail {
  return {
    ...mapEventSummary(row),
    description: row.description,
    imageIpfsHash: row.image_ipfs_hash,
    tags: row.tags,
    ageRestriction: row.age_restriction,
    eventEndDate: row.event_end_date?.toISOString() ?? null,
    venueId: row.venue_id,
    venueName: row.venue_name,
    latitude: row.latitude ? Number(row.latitude) : null,
    longitude: row.longitude ? Number(row.longitude) : null,
    zones: row.zones,
    contractAddress: row.contract_address,
    contractDeploymentTx: row.contract_deployment_tx,
    chainId: row.chain_id,
    resaleEnabled: row.resale_enabled,
    resalePriceCapBps: row.resale_price_cap_bps,
    resaleRoyaltyBps: row.resale_royalty_bps,
    totalRevenueWei: row.total_revenue_wei,
    totalCheckedIn: row.total_checked_in,
    publishedAt: row.published_at?.toISOString() ?? null,
    endedAt: row.ended_at?.toISOString() ?? null,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapTier(row: TierRow): TierResponse {
  return {
    id: row.id,
    eventId: row.event_id,
    tierIndex: row.tier_index,
    name: row.name,
    description: row.description,
    zone: row.zone,
    totalSupply: row.total_supply,
    minted: row.minted,
    maxPerWallet: row.max_per_wallet,
    priceWei: row.price_wei,
    priceDisplay: row.price_display ? Number(row.price_display) : null,
    saleStartAt: row.sale_start_at?.toISOString() ?? null,
    saleEndAt: row.sale_end_at?.toISOString() ?? null,
    earlyBirdEndAt: row.early_bird_end_at?.toISOString() ?? null,
    earlyBirdPriceWei: row.early_bird_price_wei,
    isTransferable: row.is_transferable,
    royaltyBps: row.royalty_bps,
    metadataIpfsHash: row.metadata_ipfs_hash,
    metadataIpfsUri: row.metadata_ipfs_uri,
    resaleEnabled: row.resale_enabled,
    resalePriceCapBps: row.resale_price_cap_bps,
    status: row.status as TierResponse['status'],
    createdAt: row.created_at.toISOString(),
  };
}

export async function listEventsByOrg(params: {
  orgId: string;
  offset: number;
  limit: number;
  status?: string;
}): Promise<{ rows: EventSummary[]; total: number }> {
  const values: unknown[] = [params.orgId, params.limit, params.offset];
  let where = 'e.org_id = $1 AND e.deleted_at IS NULL';
  if (params.status) {
    values.push(params.status);
    where += ` AND e.status = $${values.length}`;
  }

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM events e WHERE ${where}`,
    params.status ? [params.orgId, params.status] : [params.orgId]
  );

  const result = await pool.query<EventRow & { org_name: string }>(
    `SELECT e.*, o.name AS org_name FROM events e
     JOIN organisations o ON e.org_id = o.id
     WHERE ${where}
     ORDER BY e.updated_at DESC, e.created_at DESC LIMIT $2 OFFSET $3`,
    values
  );

  return {
    rows: result.rows.map(mapEventSummary),
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

export async function listPublishedEvents(params: {
  offset: number;
  limit: number;
  city?: string;
  category?: string;
  search?: string;
  sort?: string;
}): Promise<{ rows: EventSummary[]; total: number }> {
  const values: unknown[] = [params.limit, params.offset];
  let where = `e.status IN ('published', 'live') AND e.deleted_at IS NULL`;
  
  if (params.sort !== 'recent') {
    where += ` AND e.event_date >= NOW()`;
  }

  if (params.city) {
    values.push(params.city);
    where += ` AND e.city ILIKE $${values.length}`;
  }
  if (params.category) {
    values.push(params.category);
    where += ` AND e.category ILIKE $${values.length}`;
  }
  if (params.search) {
    values.push(params.search);
    where += ` AND to_tsvector('english', e.name || ' ' || COALESCE(e.description, '') || ' ' || COALESCE(e.city, ''))
               @@ plainto_tsquery('english', $${values.length})`;
  }

  const countValues = values.slice(2);
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM events e WHERE ${where}`,
    countValues
  );

  const orderClause = params.sort === 'recent' 
    ? 'e.updated_at DESC, e.created_at DESC' 
    : 'e.event_date ASC';

  const result = await pool.query<EventRow & { org_name: string }>(
    `SELECT e.*, o.name AS org_name FROM events e
     JOIN organisations o ON e.org_id = o.id
     WHERE ${where}
     ORDER BY ${orderClause} LIMIT $1 OFFSET $2`,
    values
  );

  return {
    rows: result.rows.map((row) => ({
      ...mapEventSummary(row),
      orgName: row.org_name,
    })),
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

export async function listFeaturedEvents(limit = 6): Promise<EventSummary[]> {
  const result = await pool.query<EventRow>(
    `SELECT ${EVENT_SELECT} FROM events
     WHERE status IN ('published', 'live') AND deleted_at IS NULL AND event_date >= NOW()
     ORDER BY total_tickets_sold DESC, event_date ASC
     LIMIT $1`,
    [limit]
  );
  return result.rows.map(mapEventSummary);
}

export async function findEventById(
  eventId: string,
  orgId?: string
): Promise<EventDetail | null> {
  const values: unknown[] = [eventId];
  let where = 'id = $1 AND deleted_at IS NULL';
  if (orgId) {
    values.push(orgId);
    where += ` AND org_id = $${values.length}`;
  }

  const result = await pool.query<EventRow>(
    `SELECT ${EVENT_SELECT} FROM events WHERE ${where}`,
    values
  );
  const row = result.rows[0];
  return row ? mapEventDetail(row) : null;
}

export async function createEvent(params: {
  orgId: string;
  createdById: string;
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  ageRestriction?: number;
  eventDate: string;
  eventEndDate?: string;
  venueId?: string;
  venueName?: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  zones?: unknown;
  resaleEnabled?: boolean;
  resalePriceCapBps?: number;
  resaleRoyaltyBps?: number;
  chainId?: number;
}): Promise<EventDetail> {
  const result = await pool.query<EventRow>(
    `INSERT INTO events (
       org_id, created_by_id, name, description, category, tags, age_restriction,
       event_date, event_end_date, venue_id, venue_name, city, country,
       latitude, longitude, zones,
       resale_enabled, resale_price_cap_bps, resale_royalty_bps, chain_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     RETURNING ${EVENT_SELECT}`,
    [
      params.orgId,
      params.createdById,
      params.name,
      params.description ?? null,
      params.category ?? null,
      params.tags ?? null,
      params.ageRestriction ?? null,
      params.eventDate,
      params.eventEndDate ?? null,
      params.venueId ?? null,
      params.venueName ?? null,
      params.city ?? null,
      params.country ?? null,
      params.latitude ?? null,
      params.longitude ?? null,
      params.zones ? JSON.stringify(params.zones) : null,
      params.resaleEnabled ?? false,
      params.resalePriceCapBps ?? null,
      params.resaleRoyaltyBps ?? null,
      params.chainId ?? 4545,
    ]
  );
  return mapEventDetail(result.rows[0]);
}

export async function updateEvent(
  eventId: string,
  orgId: string,
  fields: Record<string, unknown>
): Promise<EventDetail | null> {
  const allowed = [
    'name',
    'description',
    'category',
    'tags',
    'age_restriction',
    'event_date',
    'event_end_date',
    'venue_id',
    'venue_name',
    'city',
    'country',
    'latitude',
    'longitude',
    'zones',
    'image_ipfs_hash',
    'image_ipfs_url',
    'resale_enabled',
    'resale_price_cap_bps',
    'resale_royalty_bps',
  ] as const;

  const sets: string[] = [];
  const values: unknown[] = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      values.push(fields[key]);
      sets.push(`${key} = $${values.length}`);
    }
  }
  if (sets.length === 0) return findEventById(eventId, orgId);

  values.push(eventId, orgId);
  const result = await pool.query<EventRow>(
    `UPDATE events SET ${sets.join(', ')}, updated_at = NOW()
     WHERE id = $${values.length - 1} AND org_id = $${values.length} AND deleted_at IS NULL
     RETURNING ${EVENT_SELECT}`,
    values
  );
  const row = result.rows[0];
  return row ? mapEventDetail(row) : null;
}

export async function softDeleteEvent(eventId: string, orgId: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE events SET deleted_at = NOW(), status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL AND status = 'draft'`,
    [eventId, orgId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function setEventContract(
  eventId: string,
  orgId: string,
  params: { contractAddress: string; deploymentTx: string }
): Promise<EventDetail | null> {
  const result = await pool.query<EventRow>(
    `UPDATE events SET
       contract_address = $1,
       contract_deployment_tx = $2,
       updated_at = NOW()
     WHERE id = $3 AND org_id = $4 AND deleted_at IS NULL AND status = 'draft'
     RETURNING ${EVENT_SELECT}`,
    [params.contractAddress.toLowerCase(), params.deploymentTx, eventId, orgId]
  );
  const row = result.rows[0];
  return row ? mapEventDetail(row) : null;
}

export async function updateEventStatus(
  eventId: string,
  orgId: string,
  status: string,
  extra?: { publishedAt?: boolean; endedAt?: boolean }
): Promise<EventDetail | null> {
  const sets = ['status = $1', 'updated_at = NOW()'];
  const values: unknown[] = [status];
  if (extra?.publishedAt) sets.push('published_at = NOW()');
  if (extra?.endedAt) sets.push('ended_at = NOW()');

  values.push(eventId, orgId);
  const result = await pool.query<EventRow>(
    `UPDATE events SET ${sets.join(', ')}
     WHERE id = $${values.length - 1} AND org_id = $${values.length} AND deleted_at IS NULL
     RETURNING ${EVENT_SELECT}`,
    values
  );
  const row = result.rows[0];
  return row ? mapEventDetail(row) : null;
}

export async function listTiersByEvent(eventId: string): Promise<TierResponse[]> {
  const result = await pool.query<TierRow>(
    `SELECT ${TIER_SELECT} FROM ticket_tiers
     WHERE event_id = $1 AND deleted_at IS NULL
     ORDER BY tier_index ASC`,
    [eventId]
  );
  return result.rows.map(mapTier);
}

export async function findTierById(eventId: string, tierId: string): Promise<TierResponse | null> {
  const result = await pool.query<TierRow>(
    `SELECT ${TIER_SELECT} FROM ticket_tiers
     WHERE event_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [eventId, tierId]
  );
  const row = result.rows[0];
  return row ? mapTier(row) : null;
}

export async function getNextTierIndex(eventId: string): Promise<number> {
  const result = await pool.query<{ next: number }>(
    `SELECT COALESCE(MAX(tier_index), 0) + 1 AS next FROM ticket_tiers WHERE event_id = $1`,
    [eventId]
  );
  return result.rows[0]?.next ?? 1;
}

export async function createTier(params: {
  eventId: string;
  tierIndex: number;
  name: string;
  description?: string;
  zone?: string;
  totalSupply: number;
  maxPerWallet?: number;
  priceWei: string;
  priceDisplay?: number;
  saleStartAt?: string;
  saleEndAt?: string;
  isTransferable?: boolean;
  royaltyBps?: number;
}): Promise<TierResponse> {
  const result = await pool.query<TierRow>(
    `INSERT INTO ticket_tiers (
       event_id, tier_index, name, description, zone, total_supply, max_per_wallet,
       price_wei, price_display, sale_start_at, sale_end_at, is_transferable, royalty_bps
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING ${TIER_SELECT}`,
    [
      params.eventId,
      params.tierIndex,
      params.name,
      params.description ?? null,
      params.zone ?? null,
      params.totalSupply,
      params.maxPerWallet ?? 4,
      params.priceWei,
      params.priceDisplay ?? null,
      params.saleStartAt ?? null,
      params.saleEndAt ?? null,
      params.isTransferable ?? true,
      params.royaltyBps ?? 500,
    ]
  );
  return mapTier(result.rows[0]);
}

export async function updateTier(
  eventId: string,
  tierId: string,
  fields: Record<string, unknown>
): Promise<TierResponse | null> {
  const allowed = [
    'name',
    'description',
    'zone',
    'total_supply',
    'max_per_wallet',
    'price_wei',
    'price_display',
    'sale_start_at',
    'sale_end_at',
    'early_bird_end_at',
    'early_bird_price_wei',
    'is_transferable',
    'royalty_bps',
    'metadata_ipfs_hash',
    'metadata_ipfs_uri',
    'resale_enabled',
    'resale_price_cap_bps',
    'status',
  ] as const;

  const sets: string[] = [];
  const values: unknown[] = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      values.push(fields[key]);
      sets.push(`${key} = $${values.length}`);
    }
  }
  if (sets.length === 0) return findTierById(eventId, tierId);

  values.push(eventId, tierId);
  const result = await pool.query<TierRow>(
    `UPDATE ticket_tiers SET ${sets.join(', ')}, updated_at = NOW()
     WHERE event_id = $${values.length - 1} AND id = $${values.length} AND deleted_at IS NULL
     RETURNING ${TIER_SELECT}`,
    values
  );
  const row = result.rows[0];
  return row ? mapTier(row) : null;
}

export async function softDeleteTier(eventId: string, tierId: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE ticket_tiers SET deleted_at = NOW(), status = 'disabled', updated_at = NOW()
     WHERE event_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [eventId, tierId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function activateTiersForEvent(eventId: string): Promise<void> {
  await pool.query(
    `UPDATE ticket_tiers SET status = 'active', updated_at = NOW()
     WHERE event_id = $1 AND deleted_at IS NULL AND status = 'draft'`,
    [eventId]
  );
}

export async function getOrgWalletForEvent(orgId: string): Promise<string | null> {
  const result = await pool.query<{ super_admin_wallet_address: string }>(
    `SELECT super_admin_wallet_address FROM organisations WHERE id = $1 AND deleted_at IS NULL`,
    [orgId]
  );
  return result.rows[0]?.super_admin_wallet_address ?? null;
}
