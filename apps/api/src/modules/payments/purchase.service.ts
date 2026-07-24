import { randomBytes } from 'crypto';
import { z } from 'zod';
import { pool } from '../../shared/db/postgres.service.js';
import { connectRedis, redisClient } from '../../shared/cache/redis.service.js';
import { adminMintOnChain } from '../../shared/blockchain/event-contract.service.js';
import { generateCheckinCodes } from '../../shared/utils/checkin-code.js';
import { findUserById } from '../auth/auth.repository.js';
import {
  confirmIdempotency,
  countUserTierTickets,
  createIdempotencyRecord,
  createTickets,
  failIdempotency,
  findIdempotencyByKey,
  findTicketsByIdempotency,
  incrementEventStats,
  incrementTierMinted,
  lockTierAndEvent,
} from '../tickets/tickets.repository.js';

export const purchaseBodySchema = z.object({
  tierId: z.string().uuid(),
  quantity: z.number().int().min(1).max(10).default(1),
});

export type PurchaseValidation =
  | {
      ok: true;
      tier: NonNullable<Awaited<ReturnType<typeof lockTierAndEvent>>>['tier'];
      event: NonNullable<Awaited<ReturnType<typeof lockTierAndEvent>>>['event'];
    }
  | { ok: false; error: string; status: number; code?: string };

function generateQrSecrets(count: number): string[] {
  return Array.from({ length: count }, () => randomBytes(32).toString('hex'));
}

export async function reserveTierAvailability(tierId: string, quantity: number): Promise<boolean> {
  await connectRedis();
  const key = `tier:available:${tierId}`;
  const remaining = await redisClient.decrBy(key, quantity);
  if (remaining < 0) {
    await redisClient.incrBy(key, quantity);
    return false;
  }
  return true;
}

export async function restoreTierAvailability(tierId: string, quantity: number): Promise<void> {
  await connectRedis();
  await redisClient.incrBy(`tier:available:${tierId}`, quantity);
}

export async function validatePurchase(params: {
  userId: string;
  tierId: string;
  quantity: number;
  skipRedisReserve?: boolean;
}): Promise<PurchaseValidation> {
  if (!params.skipRedisReserve) {
    const reserved = await reserveTierAvailability(params.tierId, params.quantity);
    if (!reserved) {
      return { ok: false, error: 'Tickets sold out', status: 409, code: 'SOLD_OUT' };
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await lockTierAndEvent(client, params.tierId);
    if (!locked) {
      await client.query('ROLLBACK');
      if (!params.skipRedisReserve) {
        await restoreTierAvailability(params.tierId, params.quantity);
      }
      return { ok: false, error: 'Tier not found', status: 404 };
    }

    const { tier, event } = locked;

    if (event.status !== 'published' && event.status !== 'live') {
      await client.query('ROLLBACK');
      if (!params.skipRedisReserve) {
        await restoreTierAvailability(params.tierId, params.quantity);
      }
      return { ok: false, error: 'Event is not open for ticket sales', status: 409, code: 'EVENT_NOT_SALEABLE' };
    }

    if (tier.status !== 'active' && tier.status !== 'draft') {
      await client.query('ROLLBACK');
      if (!params.skipRedisReserve) {
        await restoreTierAvailability(params.tierId, params.quantity);
      }
      return { ok: false, error: 'Tier is not available for purchase', status: 409, code: 'TIER_UNAVAILABLE' };
    }

    if (!event.contract_address) {
      await client.query('ROLLBACK');
      if (!params.skipRedisReserve) {
        await restoreTierAvailability(params.tierId, params.quantity);
      }
      return { ok: false, error: 'Event contract not deployed', status: 409, code: 'NO_CONTRACT' };
    }

    if (tier.minted + params.quantity > tier.total_supply) {
      await client.query('ROLLBACK');
      if (!params.skipRedisReserve) {
        await restoreTierAvailability(params.tierId, params.quantity);
      }
      return { ok: false, error: 'Tickets sold out', status: 409, code: 'SOLD_OUT' };
    }

    const owned = await countUserTierTickets(client, params.userId, params.tierId);
    if (owned + params.quantity > tier.max_per_wallet) {
      await client.query('ROLLBACK');
      if (!params.skipRedisReserve) {
        await restoreTierAvailability(params.tierId, params.quantity);
      }
      return {
        ok: false,
        error: `Maximum ${tier.max_per_wallet} tickets per wallet for this tier`,
        status: 409,
        code: 'WALLET_LIMIT',
      };
    }

    await client.query('COMMIT');
    return { ok: true, tier, event };
  } catch (error) {
    await client.query('ROLLBACK');
    if (!params.skipRedisReserve) {
      await restoreTierAvailability(params.tierId, params.quantity);
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function fulfillLazyMint(params: {
  userId: string;
  tierId: string;
  quantity: number;
  idempotencyKey: string;
  orderId?: string;
}): Promise<
  | { tickets: Awaited<ReturnType<typeof createTickets>>; transactionHash: string }
  | { error: string; status: number; code?: string }
> {
  const existing = await findIdempotencyByKey(params.idempotencyKey);
  if (existing?.status === 'confirmed' && existing.transactionHash) {
    const tickets = await findTicketsByIdempotency(
      existing.userId,
      existing.tierId,
      existing.transactionHash
    );
    if (tickets.length > 0) {
      return { tickets, transactionHash: existing.transactionHash };
    }
  }

  const user = await findUserById(params.userId);
  if (!user) return { error: 'User not found', status: 404 };

  const validation = await validatePurchase({
    userId: params.userId,
    tierId: params.tierId,
    quantity: params.quantity,
    skipRedisReserve: true,
  });
  if (!validation.ok) {
    return { error: validation.error, status: validation.status, code: validation.code };
  }

  const { tier, event } = validation;
  const totalPaidWei = (BigInt(tier.price_wei) * BigInt(params.quantity)).toString();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!existing) {
      await createIdempotencyRecord(client, {
        idempotencyKey: params.idempotencyKey,
        userId: params.userId,
        tierId: params.tierId,
        quantity: params.quantity,
      });
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  try {
    const { txHash } = await adminMintOnChain({
      contractAddress: event.contract_address!,
      toWallet: user.wallet_address,
      tierIndex: tier.tier_index,
      quantity: params.quantity,
    });

    const qrSecrets = generateQrSecrets(params.quantity);
    const checkinCodes = generateCheckinCodes(params.quantity);
    const writeClient = await pool.connect();
    try {
      await writeClient.query('BEGIN');

      const tickets = await createTickets(writeClient, {
        eventId: event.id,
        tierId: tier.id,
        tierIndex: tier.tier_index,
        ownerUserId: params.userId,
        ownerWallet: user.wallet_address,
        tokenId: tier.tier_index,
        contractAddress: event.contract_address!,
        transactionHash: txHash,
        quantity: params.quantity,
        qrSecrets,
        checkinCodes,
      });

      await incrementTierMinted(writeClient, params.tierId, params.quantity);
      await incrementEventStats(writeClient, event.id, params.quantity, totalPaidWei);
      await confirmIdempotency(writeClient, params.idempotencyKey, txHash);

      await writeClient.query('COMMIT');
      return { tickets, transactionHash: txHash };
    } catch (error) {
      await writeClient.query('ROLLBACK');
      throw error;
    } finally {
      writeClient.release();
    }
  } catch (error) {
    await failIdempotency(params.idempotencyKey);
    const message = error instanceof Error ? error.message : 'Lazy mint failed';
    return { error: message, status: 502, code: 'MINT_FAILED' };
  }
}
