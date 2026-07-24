import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { pool } from '../../shared/db/postgres.service.js';
import { connectRedis, redisClient } from '../../shared/cache/redis.service.js';
import { mintTicketOnChain } from '../../shared/blockchain/event-contract.service.js';
import { parsePagination } from '../../shared/utils/pagination.js';
import { generateCheckinCodes } from '../../shared/utils/checkin-code.js';
import { findUserById } from '../auth/auth.repository.js';
import {
  confirmIdempotency,
  countUserTierTickets,
  createIdempotencyRecord,
  createTickets,
  failIdempotency,
  findIdempotencyByKey,
  findTicketById,
  findTicketsByIdempotency,
  incrementEventStats,
  incrementTierMinted,
  listTicketsByOwner,
  lockTierAndEvent,
} from './tickets.repository.js';

const mintBodySchema = z.object({
  tierId: z.string().uuid(),
  quantity: z.number().int().min(1).max(10).default(1),
});

const QR_NONCE_TTL_SECONDS = 90;
const QR_REFRESH_SECONDS = 60;

async function reserveTierAvailability(tierId: string, quantity: number): Promise<boolean> {
  await connectRedis();
  const key = `tier:available:${tierId}`;
  const remaining = await redisClient.decrBy(key, quantity);
  if (remaining < 0) {
    await redisClient.incrBy(key, quantity);
    return false;
  }
  return true;
}

async function restoreTierAvailability(tierId: string, quantity: number): Promise<void> {
  await connectRedis();
  await redisClient.incrBy(`tier:available:${tierId}`, quantity);
}

function generateQrSecrets(count: number): string[] {
  return Array.from({ length: count }, () => randomBytes(32).toString('hex'));
}

export async function mintTickets(params: {
  userId: string;
  idempotencyKey: string;
  body: unknown;
}): Promise<
  | { tickets: Awaited<ReturnType<typeof createTickets>>; transactionHash: string; totalPaidWei: string }
  | { error: string; status: number; code?: string }
> {
  const parsed = mintBodySchema.safeParse(params.body);
  if (!parsed.success) {
    return { error: 'Invalid mint request', status: 400, code: 'VALIDATION_ERROR' };
  }

  const { tierId, quantity } = parsed.data;

  const existing = await findIdempotencyByKey(params.idempotencyKey);
  if (existing?.status === 'confirmed' && existing.transactionHash) {
    const tickets = await findTicketsByIdempotency(
      existing.userId,
      existing.tierId,
      existing.transactionHash
    );
    if (tickets.length > 0) {
      return {
        tickets,
        transactionHash: existing.transactionHash,
        totalPaidWei: '0',
      };
    }
  }
  if (existing?.status === 'pending') {
    return { error: 'Mint already in progress for this idempotency key', status: 409, code: 'MINT_IN_PROGRESS' };
  }

  const user = await findUserById(params.userId);
  if (!user) return { error: 'User not found', status: 404 };

  const reserved = await reserveTierAvailability(tierId, quantity);
  if (!reserved) {
    return { error: 'Tickets sold out', status: 409, code: 'SOLD_OUT' };
  }

  const client = await pool.connect();
  let lockedTier: NonNullable<Awaited<ReturnType<typeof lockTierAndEvent>>>['tier'] | null = null;
  let lockedEvent: NonNullable<Awaited<ReturnType<typeof lockTierAndEvent>>>['event'] | null = null;

  try {
    await client.query('BEGIN');

    const locked = await lockTierAndEvent(client, tierId);
    if (!locked) {
      await client.query('ROLLBACK');
      await restoreTierAvailability(tierId, quantity);
      return { error: 'Tier not found', status: 404 };
    }

    lockedTier = locked.tier;
    lockedEvent = locked.event;
    const tier = locked.tier;
    const event = locked.event;

    if (event.status !== 'published' && event.status !== 'live') {
      await client.query('ROLLBACK');
      await restoreTierAvailability(tierId, quantity);
      return { error: 'Event is not open for ticket sales', status: 409, code: 'EVENT_NOT_SALEABLE' };
    }

    if (tier.status !== 'active' && tier.status !== 'draft') {
      await client.query('ROLLBACK');
      await restoreTierAvailability(tierId, quantity);
      return { error: 'Tier is not available for purchase', status: 409, code: 'TIER_UNAVAILABLE' };
    }

    if (!event.contract_address) {
      await client.query('ROLLBACK');
      await restoreTierAvailability(tierId, quantity);
      return { error: 'Event contract not deployed', status: 409, code: 'NO_CONTRACT' };
    }

    if (tier.minted + quantity > tier.total_supply) {
      await client.query('ROLLBACK');
      await restoreTierAvailability(tierId, quantity);
      return { error: 'Tickets sold out', status: 409, code: 'SOLD_OUT' };
    }

    const owned = await countUserTierTickets(client, params.userId, tierId);
    if (owned + quantity > tier.max_per_wallet) {
      await client.query('ROLLBACK');
      await restoreTierAvailability(tierId, quantity);
      return {
        error: `Maximum ${tier.max_per_wallet} tickets per wallet for this tier`,
        status: 409,
        code: 'WALLET_LIMIT',
      };
    }

    if (!existing) {
      await createIdempotencyRecord(client, {
        idempotencyKey: params.idempotencyKey,
        userId: params.userId,
        tierId,
        quantity,
      });
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    await restoreTierAvailability(tierId, quantity);
    throw error;
  } finally {
    client.release();
  }

  if (!lockedTier || !lockedEvent) {
    return { error: 'Tier not found', status: 404 };
  }

  const totalPaidWei = (BigInt(lockedTier.price_wei) * BigInt(quantity)).toString();

  try {
    const { txHash } = await mintTicketOnChain({
      contractAddress: lockedEvent.contract_address!,
      toWallet: user.wallet_address,
      tierIndex: lockedTier.tier_index,
      quantity,
      priceWei: lockedTier.price_wei,
    });

    const qrSecrets = generateQrSecrets(quantity);
    const checkinCodes = generateCheckinCodes(quantity);
    const writeClient = await pool.connect();
    try {
      await writeClient.query('BEGIN');

      const tickets = await createTickets(writeClient, {
        eventId: lockedEvent.id,
        tierId: lockedTier.id,
        tierIndex: lockedTier.tier_index,
        ownerUserId: params.userId,
        ownerWallet: user.wallet_address,
        tokenId: lockedTier.tier_index,
        contractAddress: lockedEvent.contract_address!,
        transactionHash: txHash,
        quantity,
        qrSecrets,
        checkinCodes,
      });

      await incrementTierMinted(writeClient, tierId, quantity);
      await incrementEventStats(writeClient, lockedEvent.id, quantity, totalPaidWei);
      await confirmIdempotency(writeClient, params.idempotencyKey, txHash);

      await writeClient.query('COMMIT');

      return { tickets, transactionHash: txHash, totalPaidWei };
    } catch (error) {
      await writeClient.query('ROLLBACK');
      throw error;
    } finally {
      writeClient.release();
    }
  } catch (error) {
    await failIdempotency(params.idempotencyKey);
    await restoreTierAvailability(tierId, quantity);
    const message = error instanceof Error ? error.message : 'Mint transaction failed';
    return { error: message, status: 502, code: 'MINT_FAILED' };
  }
}

export async function getMyTickets(userId: string, query: Record<string, string | undefined>) {
  const { page, limit, offset } = parsePagination(query);
  const { rows, total } = await listTicketsByOwner(userId, { offset, limit });
  return { rows, meta: { page, limit, total } };
}

export async function getTicket(userId: string, ticketId: string) {
  const ticket = await findTicketById(ticketId, userId);
  if (!ticket) return { error: 'Ticket not found', status: 404 as const };
  const { qrSecret: _secret, ...publicTicket } = ticket;
  return { ticket: publicTicket };
}

export async function generateTicketQr(userId: string, ticketId: string) {
  const ticket = await findTicketById(ticketId, userId);
  if (!ticket) return { error: 'Ticket not found', status: 404 as const };
  if (ticket.status !== 'valid') {
    return { error: 'Ticket is not valid for check-in', status: 409 as const, code: 'INVALID_TICKET' };
  }

  const nonce = randomBytes(16).toString('hex');
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', ticket.qrSecret)
    .update(`${ticketId}:${ts}:${nonce}`)
    .digest('hex');

  await connectRedis();
  await redisClient.set(`qr:nonce:${ticketId}:${nonce}`, '1', { EX: QR_NONCE_TTL_SECONDS });

  const payload = Buffer.from(JSON.stringify({ tid: ticketId, ts, n: nonce, sig })).toString(
    'base64'
  );

  return { payload, expiresIn: QR_REFRESH_SECONDS, checkinCode: ticket.checkinCode };
}

export function verifyQrSignature(
  ticketId: string,
  ts: number,
  nonce: string,
  sig: string,
  qrSecret: string
): boolean {
  const expected = createHmac('sha256', qrSecret).update(`${ticketId}:${ts}:${nonce}`).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

export { mintBodySchema };
