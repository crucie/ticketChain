import type { PoolClient } from 'pg';
import { pool } from '../../shared/db/postgres.service.js';
import type { TicketDetail, TicketSummary } from '@ticketchain/shared';

interface TicketRow {
  id: string;
  event_id: string;
  tier_id: string;
  tier_index: number;
  owner_user_id: string | null;
  owner_wallet_address: string;
  token_id: number;
  contract_address: string;
  transaction_hash: string;
  minted_at: Date;
  qr_secret: string;
  checkin_code: string;
  status: string;
  used_at: Date | null;
  seat_number: string | null;
  promo_code_used: string | null;
  discount_applied_bps: number | null;
  created_at: Date;
}

interface TierLockRow {
  id: string;
  event_id: string;
  tier_index: number;
  name: string;
  total_supply: number;
  minted: number;
  max_per_wallet: number;
  price_wei: string;
  status: string;
}

interface EventLockRow {
  id: string;
  org_id: string;
  name: string;
  status: string;
  contract_address: string | null;
}

const TICKET_SELECT = `
  id, event_id, tier_id, tier_index, owner_user_id, owner_wallet_address,
  token_id, contract_address, transaction_hash, minted_at, qr_secret, checkin_code, status,
  used_at, seat_number, promo_code_used, discount_applied_bps, created_at
`;

function mapTicketSummary(row: TicketRow): TicketSummary {
  return {
    id: row.id,
    eventId: row.event_id,
    tierId: row.tier_id,
    tierIndex: row.tier_index,
    ownerWalletAddress: row.owner_wallet_address,
    tokenId: row.token_id,
    contractAddress: row.contract_address,
    status: row.status as TicketSummary['status'],
    mintedAt: row.minted_at.toISOString(),
    checkinCode: row.checkin_code,
  };
}

function mapTicketDetail(row: TicketRow): TicketDetail {
  return {
    ...mapTicketSummary(row),
    transactionHash: row.transaction_hash,
    seatNumber: row.seat_number,
    promoCodeUsed: row.promo_code_used,
    discountAppliedBps: row.discount_applied_bps,
    usedAt: row.used_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

export async function findIdempotencyByKey(key: string): Promise<{
  id: string;
  status: string;
  transactionHash: string | null;
  userId: string;
  tierId: string;
  quantity: number;
} | null> {
  const result = await pool.query<{
    id: string;
    status: string;
    transaction_hash: string | null;
    user_id: string;
    tier_id: string;
    quantity: number;
  }>(
    `SELECT id, status, transaction_hash, user_id, tier_id, quantity
     FROM mint_idempotency WHERE idempotency_key = $1`,
    [key]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    transactionHash: row.transaction_hash,
    userId: row.user_id,
    tierId: row.tier_id,
    quantity: row.quantity,
  };
}

export async function findTicketsByIdempotency(
  userId: string,
  tierId: string,
  txHash: string
): Promise<TicketSummary[]> {
  const result = await pool.query<TicketRow>(
    `SELECT ${TICKET_SELECT} FROM tickets
     WHERE owner_user_id = $1 AND tier_id = $2 AND transaction_hash = $3
     ORDER BY created_at ASC`,
    [userId, tierId, txHash]
  );
  return result.rows.map(mapTicketSummary);
}

export async function lockTierAndEvent(
  client: PoolClient,
  tierId: string
): Promise<{ tier: TierLockRow; event: EventLockRow } | null> {
  const tierResult = await client.query<TierLockRow>(
    `SELECT id, event_id, tier_index, name, total_supply, minted, max_per_wallet, price_wei, status
     FROM ticket_tiers WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
    [tierId]
  );
  const tier = tierResult.rows[0];
  if (!tier) return null;

  const eventResult = await client.query<EventLockRow>(
    `SELECT id, org_id, name, status, contract_address
     FROM events WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
    [tier.event_id]
  );
  const event = eventResult.rows[0];
  if (!event) return null;

  return { tier, event };
}

export async function countUserTierTickets(
  client: PoolClient,
  userId: string,
  tierId: string
): Promise<number> {
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM tickets
     WHERE owner_user_id = $1 AND tier_id = $2 AND status NOT IN ('cancelled')`,
    [userId, tierId]
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function createIdempotencyRecord(
  client: PoolClient,
  params: {
    idempotencyKey: string;
    userId: string;
    tierId: string;
    quantity: number;
  }
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO mint_idempotency (idempotency_key, user_id, tier_id, quantity, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + INTERVAL '10 minutes')
     RETURNING id`,
    [params.idempotencyKey, params.userId, params.tierId, params.quantity]
  );
  return result.rows[0].id;
}

export async function confirmIdempotency(
  client: PoolClient,
  idempotencyKey: string,
  txHash: string
): Promise<void> {
  await client.query(
    `UPDATE mint_idempotency SET
       status = 'confirmed',
       transaction_hash = $1,
       confirmed_at = NOW()
     WHERE idempotency_key = $2`,
    [txHash, idempotencyKey]
  );
}

export async function failIdempotency(idempotencyKey: string): Promise<void> {
  await pool.query(
    `UPDATE mint_idempotency SET status = 'failed' WHERE idempotency_key = $1 AND status = 'pending'`,
    [idempotencyKey]
  );
}

export async function createTickets(
  client: PoolClient,
  params: {
    eventId: string;
    tierId: string;
    tierIndex: number;
    ownerUserId: string;
    ownerWallet: string;
    tokenId: number;
    contractAddress: string;
    transactionHash: string;
    quantity: number;
    qrSecrets: string[];
    checkinCodes: string[];
  }
): Promise<TicketSummary[]> {
  const tickets: TicketSummary[] = [];
  for (let i = 0; i < params.quantity; i++) {
    const result = await client.query<TicketRow>(
      `INSERT INTO tickets (
         event_id, tier_id, tier_index, owner_user_id, owner_wallet_address,
         token_id, contract_address, transaction_hash, qr_secret, checkin_code
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING ${TICKET_SELECT}`,
      [
        params.eventId,
        params.tierId,
        params.tierIndex,
        params.ownerUserId,
        params.ownerWallet.toLowerCase(),
        params.tokenId,
        params.contractAddress.toLowerCase(),
        params.transactionHash,
        params.qrSecrets[i],
        params.checkinCodes[i],
      ]
    );
    tickets.push(mapTicketSummary(result.rows[0]));
  }
  return tickets;
}

export async function incrementTierMinted(
  client: PoolClient,
  tierId: string,
  quantity: number
): Promise<void> {
  await client.query(
    `UPDATE ticket_tiers SET minted = minted + $1, updated_at = NOW() WHERE id = $2`,
    [quantity, tierId]
  );
}

export async function incrementEventStats(
  client: PoolClient,
  eventId: string,
  quantity: number,
  revenueWei: string
): Promise<void> {
  await client.query(
    `UPDATE events SET
       total_tickets_sold = total_tickets_sold + $1,
       total_revenue_wei = total_revenue_wei + $2,
       updated_at = NOW()
     WHERE id = $3`,
    [quantity, revenueWei, eventId]
  );
}

export async function listTicketsByOwner(
  userId: string,
  params: { offset: number; limit: number }
): Promise<{ rows: TicketDetail[]; total: number }> {
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM tickets WHERE owner_user_id = $1`,
    [userId]
  );

  const result = await pool.query<TicketRow>(
    `SELECT ${TICKET_SELECT} FROM tickets
     WHERE owner_user_id = $1
     ORDER BY minted_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, params.limit, params.offset]
  );

  return {
    rows: result.rows.map(mapTicketDetail),
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

export async function findTicketById(
  ticketId: string,
  ownerUserId?: string
): Promise<(TicketDetail & { qrSecret: string }) | null> {
  const values: unknown[] = [ticketId];
  let where = 'id = $1';
  if (ownerUserId) {
    values.push(ownerUserId);
    where += ` AND owner_user_id = $${values.length}`;
  }

  const result = await pool.query<TicketRow>(
    `SELECT ${TICKET_SELECT} FROM tickets WHERE ${where}`,
    values
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    ...mapTicketDetail(row),
    qrSecret: row.qr_secret,
    checkinCode: row.checkin_code,
  };
}
