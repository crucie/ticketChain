import { pool } from '../../shared/db/postgres.service.js';
import { findEventById } from '../event/event.repository.js';
import { parsePagination } from '../../shared/utils/pagination.js';

export async function adminGetEventAnalytics(orgId: string, eventId: string) {
  const event = await findEventById(eventId, orgId);
  if (!event) return { error: 'Event not found', status: 404 as const };

  const tierStats = await pool.query<{
    tier_name: string;
    total_supply: number;
    minted: number;
    revenue_wei: string;
  }>(
    `SELECT tt.name AS tier_name, tt.total_supply, tt.minted,
            (tt.minted * tt.price_wei)::text AS revenue_wei
     FROM ticket_tiers tt
     WHERE tt.event_id = $1 AND tt.deleted_at IS NULL
     ORDER BY tt.tier_index`,
    [eventId]
  );

  return {
    analytics: {
      eventId,
      totalTicketsSold: event.totalTicketsSold,
      totalCheckedIn: event.totalCheckedIn,
      totalRevenueWei: event.totalRevenueWei,
      attendanceRate:
        event.totalTicketsSold > 0
          ? Math.round((event.totalCheckedIn / event.totalTicketsSold) * 10000) / 100
          : 0,
      tierBreakdown: tierStats.rows.map((r) => ({
        tierName: r.tier_name,
        totalSupply: r.total_supply,
        minted: r.minted,
        revenueWei: r.revenue_wei,
      })),
    },
  };
}

export async function adminListEventTickets(
  orgId: string,
  eventId: string,
  query: Record<string, string | undefined>
) {
  const event = await findEventById(eventId, orgId);
  if (!event) return { error: 'Event not found', status: 404 as const };

  const { page, limit, offset } = parsePagination(query);
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM tickets t
     JOIN ticket_tiers tt ON tt.id = t.tier_id
     WHERE tt.event_id = $1`,
    [eventId]
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const result = await pool.query<{
    id: string;
    tier_name: string;
    owner_wallet: string;
    status: string;
    seat_number: string | null;
    created_at: Date;
  }>(
    `SELECT t.id, tt.name AS tier_name, t.owner_wallet_address AS owner_wallet,
            t.status, t.seat_number, t.created_at
     FROM tickets t
     JOIN ticket_tiers tt ON tt.id = t.tier_id
     WHERE tt.event_id = $1
     ORDER BY t.created_at DESC
     LIMIT $2 OFFSET $3`,
    [eventId, limit, offset]
  );

  return {
    rows: result.rows.map((r) => ({
      id: r.id,
      tierName: r.tier_name,
      ownerWallet: r.owner_wallet,
      status: r.status,
      seatNumber: r.seat_number,
      createdAt: r.created_at.toISOString(),
    })),
    meta: { page, limit, total },
  };
}

export async function adminListEventCheckins(
  orgId: string,
  eventId: string,
  query: Record<string, string | undefined>
) {
  const event = await findEventById(eventId, orgId);
  if (!event) return { error: 'Event not found', status: 404 as const };

  const { page, limit, offset } = parsePagination(query);
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM checkins WHERE event_id = $1`,
    [eventId]
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const result = await pool.query<{
    id: string;
    ticket_id: string;
    zone_accessed: string | null;
    scan_method: string;
    verification_success: boolean;
    failure_reason: string | null;
    transaction_hash: string | null;
    chain_status: string | null;
    created_at: Date;
  }>(
    `SELECT id, ticket_id, zone_accessed, scan_method, verification_success, failure_reason,
            transaction_hash, chain_status, created_at
     FROM checkins WHERE event_id = $1
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [eventId, limit, offset]
  );

  return {
    rows: result.rows.map((r) => ({
      id: r.id,
      ticketId: r.ticket_id,
      zoneAccessed: r.zone_accessed,
      scanMethod: r.scan_method,
      success: r.verification_success,
      failureReason: r.failure_reason,
      transactionHash: r.transaction_hash,
      chainStatus: r.chain_status,
      createdAt: r.created_at.toISOString(),
    })),
    meta: { page, limit, total },
  };
}
