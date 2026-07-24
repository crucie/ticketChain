import type { PoolClient } from 'pg';
import { pool } from '../../shared/db/postgres.service.js';
import type {
  VolunteerCheckinHistoryItem,
  VolunteerCheckinStats,
  VolunteerEventAssignment,
} from '@ticketchain/shared';

/* ------------------------------------------------------------------ */
/*  Row types                                                         */
/* ------------------------------------------------------------------ */

interface AssignmentRow {
  id: string;
  event_id: string;
  user_id: string;
  org_id: string;
  permitted_zones: string[];
  status: string;
  created_at: Date;
}

interface TicketCheckinRow {
  id: string;
  event_id: string;
  tier_id: string;
  tier_index: number;
  owner_user_id: string | null;
  owner_wallet_address: string;
  token_id: number;
  contract_address: string | null;
  qr_secret: string;
  status: string;
  seat_number: string | null;
  tier_name: string;
  tier_zone: string | null;
  wallet_blacklisted: boolean;
}

interface EventAssignmentRow {
  id: string;
  event_id: string;
  event_name: string;
  event_date: Date;
  event_status: string;
  venue_name: string | null;
  city: string | null;
  permitted_zones: string[];
  total_tickets_sold: number;
  total_checked_in: number;
  created_at: Date;
}

interface EventDetailRow {
  id: string;
  name: string;
  description: string | null;
  event_date: Date;
  event_end_date: Date | null;
  status: string;
  venue_name: string | null;
  city: string | null;
  country: string | null;
  zones: unknown;
  total_tickets_sold: number;
  total_checked_in: number;
  image_ipfs_url: string | null;
}

interface CheckinHistoryRow {
  id: string;
  ticket_id: string;
  event_id: string;
  zone_accessed: string | null;
  scan_method: string;
  verification_success: boolean;
  failure_reason: string | null;
  transaction_hash: string | null;
  chain_status: string | null;
  created_at: Date;
}

interface StatsRow {
  event_id: string;
  event_name: string;
  total_tickets_sold: number;
  total_checked_in: number;
}

interface TicketHashRow {
  id: string;
}

/* ------------------------------------------------------------------ */
/*  Volunteer assignment queries                                      */
/* ------------------------------------------------------------------ */

export async function findVolunteerAssignment(
  userId: string,
  eventId: string
): Promise<{ id: string; permittedZones: string[]; orgId: string } | null> {
  const result = await pool.query<AssignmentRow>(
    `SELECT id, event_id, user_id, org_id, permitted_zones, status, created_at
     FROM volunteer_event_assignments
     WHERE user_id = $1 AND event_id = $2 AND status = 'active'`,
    [userId, eventId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    permittedZones: row.permitted_zones,
    orgId: row.org_id,
  };
}

export async function findVolunteerAssignments(
  userId: string
): Promise<VolunteerEventAssignment[]> {
  const result = await pool.query<EventAssignmentRow>(
    `SELECT
       vea.id,
       vea.event_id,
       e.name         AS event_name,
       e.event_date,
       e.status       AS event_status,
       e.venue_name,
       e.city,
       vea.permitted_zones,
       e.total_tickets_sold,
       e.total_checked_in,
       vea.created_at
     FROM volunteer_event_assignments vea
     JOIN events e ON e.id = vea.event_id AND e.deleted_at IS NULL
     WHERE vea.user_id = $1 AND vea.status = 'active'
     ORDER BY e.event_date ASC`,
    [userId]
  );
  return result.rows.map(mapAssignment);
}

export async function findVolunteerEventDetail(
  userId: string,
  eventId: string
): Promise<{
  assignment: { permittedZones: string[] };
  event: EventDetailRow;
} | null> {
  const assignment = await findVolunteerAssignment(userId, eventId);
  if (!assignment) return null;

  const result = await pool.query<EventDetailRow>(
    `SELECT id, name, description, event_date, event_end_date, status,
            venue_name, city, country, zones, total_tickets_sold,
            total_checked_in, image_ipfs_url
     FROM events
     WHERE id = $1 AND deleted_at IS NULL`,
    [eventId]
  );
  const event = result.rows[0];
  if (!event) return null;

  return {
    assignment: { permittedZones: assignment.permittedZones },
    event,
  };
}

/* ------------------------------------------------------------------ */
/*  Ticket lookup for check-in                                        */
/* ------------------------------------------------------------------ */

export async function findTicketForCheckin(
  ticketId: string
): Promise<TicketCheckinRow | null> {
  const result = await pool.query<TicketCheckinRow>(
    `SELECT
       t.id, t.event_id, t.tier_id, t.tier_index,
       t.owner_user_id, t.owner_wallet_address,
       t.token_id, t.contract_address, t.qr_secret,
       t.status, t.seat_number,
       tt.name AS tier_name,
       tt.zone AS tier_zone,
       COALESCE(w.is_blacklisted, FALSE) AS wallet_blacklisted
     FROM tickets t
     JOIN ticket_tiers tt ON tt.id = t.tier_id
     LEFT JOIN wallets w ON w.wallet_address = t.owner_wallet_address
     WHERE t.id = $1`,
    [ticketId]
  );
  return result.rows[0] ?? null;
}

/* ------------------------------------------------------------------ */
/*  Check-in write operations (all within a transaction)              */
/* ------------------------------------------------------------------ */

export async function insertCheckin(
  client: PoolClient,
  params: {
    eventId: string;
    ticketId: string;
    checkedInById: string;
    qrSignature: string;
    qrNonce: string;
    qrTimestamp: number;
    scanMethod: string;
    verificationSuccess: boolean;
    failureReason: string | null;
    zoneAccessed: string | null;
    deviceId: string | null;
  }
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO checkins (
       event_id, ticket_id, checked_in_by_id,
       qr_signature, qr_nonce, qr_timestamp,
       scan_method, verification_success, failure_reason,
       zone_accessed, device_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id`,
    [
      params.eventId,
      params.ticketId,
      params.checkedInById,
      params.qrSignature,
      params.qrNonce,
      params.qrTimestamp,
      params.scanMethod,
      params.verificationSuccess,
      params.failureReason,
      params.zoneAccessed,
      params.deviceId,
    ]
  );
  return result.rows[0].id;
}

export async function markTicketUsed(
  client: PoolClient,
  ticketId: string,
  volunteerId: string
): Promise<boolean> {
  const result = await client.query(
    `UPDATE tickets
     SET status = 'used', used_at = NOW(), used_by_volunteer_id = $1, updated_at = NOW()
     WHERE id = $2 AND status = 'valid'`,
    [volunteerId, ticketId]
  );
  return (result.rowCount ?? 0) === 1;
}

export async function incrementCheckedIn(
  client: PoolClient,
  eventId: string
): Promise<void> {
  await client.query(
    `UPDATE events SET total_checked_in = total_checked_in + 1, updated_at = NOW()
     WHERE id = $1`,
    [eventId]
  );
}

export async function updateCheckinChainTx(params: {
  checkinId: string;
  transactionHash: string | null;
  chainStatus: 'pending' | 'confirmed' | 'failed';
}): Promise<void> {
  await pool.query(
    `UPDATE checkins
     SET transaction_hash = COALESCE($2, transaction_hash),
         chain_status = $3
     WHERE id = $1`,
    [params.checkinId, params.transactionHash, params.chainStatus]
  );
}

export async function listPendingCheckinChainJobs(limit = 25): Promise<
  Array<{
    checkinId: string;
    ticketId: string;
    ownerWallet: string;
    tierIndex: number;
    contractAddress: string;
  }>
> {
  const result = await pool.query<{
    checkin_id: string;
    ticket_id: string;
    owner_wallet_address: string;
    tier_index: number;
    contract_address: string;
  }>(
    `SELECT c.id AS checkin_id, t.id AS ticket_id, t.owner_wallet_address,
            t.tier_index, t.contract_address
     FROM checkins c
     JOIN tickets t ON t.id = c.ticket_id
     WHERE c.verification_success = TRUE
       AND t.contract_address IS NOT NULL
       AND (c.chain_status IS NULL OR c.chain_status = 'pending')
       AND (c.transaction_hash IS NULL OR c.transaction_hash = '')
     ORDER BY c.created_at ASC
     LIMIT $1`,
    [limit]
  );

  return result.rows.map((r) => ({
    checkinId: r.checkin_id,
    ticketId: r.ticket_id,
    ownerWallet: r.owner_wallet_address,
    tierIndex: r.tier_index,
    contractAddress: r.contract_address,
  }));
}

/* ------------------------------------------------------------------ */
/*  Stats & history queries                                           */
/* ------------------------------------------------------------------ */

export async function getCheckinStats(
  eventId: string
): Promise<VolunteerCheckinStats | null> {
  const result = await pool.query<StatsRow>(
    `SELECT
       id AS event_id,
       name AS event_name,
       total_tickets_sold,
       total_checked_in
     FROM events
     WHERE id = $1 AND deleted_at IS NULL`,
    [eventId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    eventId: row.event_id,
    eventName: row.event_name,
    totalTicketsSold: row.total_tickets_sold,
    totalCheckedIn: row.total_checked_in,
    percentage:
      row.total_tickets_sold > 0
        ? Math.round((row.total_checked_in / row.total_tickets_sold) * 10000) / 100
        : 0,
  };
}

export async function getCheckinHistory(
  volunteerId: string,
  eventId: string | undefined,
  pagination: { offset: number; limit: number }
): Promise<{ rows: VolunteerCheckinHistoryItem[]; total: number }> {
  const values: unknown[] = [volunteerId];
  let whereExtra = '';
  if (eventId) {
    values.push(eventId);
    whereExtra = ` AND c.event_id = $${values.length}`;
  }

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM checkins c
     WHERE c.checked_in_by_id = $1${whereExtra}`,
    values
  );

  const queryValues = [...values, pagination.limit, pagination.offset];
  const result = await pool.query<CheckinHistoryRow>(
    `SELECT c.id, c.ticket_id, c.event_id, c.zone_accessed,
            c.scan_method, c.verification_success, c.failure_reason,
            c.transaction_hash, c.chain_status, c.created_at
     FROM checkins c
     WHERE c.checked_in_by_id = $1${whereExtra}
     ORDER BY c.created_at DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    queryValues
  );

  return {
    rows: result.rows.map(mapCheckinHistory),
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

export async function getValidTicketIds(eventId: string): Promise<string[]> {
  const result = await pool.query<TicketHashRow>(
    `SELECT id FROM tickets WHERE event_id = $1 AND status = 'valid' ORDER BY id`,
    [eventId]
  );
  return result.rows.map((r) => r.id);
}

/* ------------------------------------------------------------------ */
/*  Mappers                                                           */
/* ------------------------------------------------------------------ */

function mapAssignment(row: EventAssignmentRow): VolunteerEventAssignment {
  return {
    id: row.id,
    eventId: row.event_id,
    eventName: row.event_name,
    eventDate: row.event_date.toISOString(),
    eventStatus: row.event_status,
    venueName: row.venue_name,
    city: row.city,
    permittedZones: row.permitted_zones,
    totalTicketsSold: row.total_tickets_sold,
    totalCheckedIn: row.total_checked_in,
    assignedAt: row.created_at.toISOString(),
  };
}

function mapCheckinHistory(row: CheckinHistoryRow): VolunteerCheckinHistoryItem {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    eventId: row.event_id,
    zone: row.zone_accessed,
    scanMethod: row.scan_method,
    verificationSuccess: row.verification_success,
    failureReason: row.failure_reason,
    transactionHash: row.transaction_hash,
    chainStatus: row.chain_status,
    createdAt: row.created_at.toISOString(),
  };
}
