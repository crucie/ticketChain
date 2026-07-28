import { randomBytes } from 'crypto';
import { z } from 'zod';
import { pool } from '../../shared/db/postgres.service.js';
import { connectRedis, redisClient } from '../../shared/cache/redis.service.js';
import { adminTransferOnChain, getExplorerTxUrl } from '../../shared/blockchain/event-contract.service.js';
import {
  buyTicketOnChain,
  cancelListingOnChain,
  isMarketplaceConfigured,
  listTicketOnChain,
} from '../../shared/blockchain/marketplace-contract.service.js';
import { writeAuditLog } from '../../shared/audit/audit-log.service.js';
import { isWalletBlacklisted, logFraud } from '../../shared/fraud/fraud.service.js';
import { findUserById } from '../auth/auth.repository.js';
import { findTicketById } from '../tickets/tickets.repository.js';
import {
  cancelListing,
  createListing,
  findListingById,
  findListingByTicketId,
  listActiveListings,
  markListingSold,
} from './marketplace.repository.js';

const resellBodySchema = z.object({
  askPriceWei: z.string().regex(/^\d+$/),
});

function mapListing(row: Awaited<ReturnType<typeof listActiveListings>>[number]) {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    eventId: row.event_id,
    tierId: row.tier_id,
    sellerUserId: row.seller_user_id,
    sellerWallet: row.seller_wallet,
    facePriceWei: row.face_price_wei,
    askPriceWei: row.ask_price_wei,
    maxPriceWei: row.max_price_wei,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}

async function getTicketContext(ticketId: string, ownerUserId: string) {
  const ticket = await findTicketById(ticketId, ownerUserId);
  if (!ticket) return null;

  const result = await pool.query<{
    resale_enabled: boolean;
    resale_price_cap_bps: number | null;
    contract_address: string | null;
    tier_resale_enabled: boolean | null;
    tier_resale_cap_bps: number | null;
    price_wei: string;
    is_transferable: boolean;
  }>(
    `SELECT e.resale_enabled, e.resale_price_cap_bps, e.contract_address,
            t.resale_enabled AS tier_resale_enabled,
            t.resale_price_cap_bps AS tier_resale_cap_bps,
            t.price_wei::text, t.is_transferable
     FROM events e
     JOIN ticket_tiers t ON t.id = $1 AND t.event_id = e.id
     WHERE e.id = $2`,
    [ticket.tierId, ticket.eventId]
  );
  const ctx = result.rows[0];
  if (!ctx) return null;

  return { ticket, ctx };
}

export async function listMarketplace() {
  const rows = await listActiveListings();
  return rows.map(mapListing);
}

export async function createResaleListing(params: {
  userId: string;
  ticketId: string;
  body: unknown;
}): Promise<
  | {
      listing: ReturnType<typeof mapListing>;
      transactionHash: string | null;
      explorerUrl: string | null;
    }
  | { error: string; status: number }
> {
  const parsed = resellBodySchema.safeParse(params.body);
  if (!parsed.success) {
    return { error: 'Invalid resale request', status: 400 };
  }

  const context = await getTicketContext(params.ticketId, params.userId);
  if (!context) return { error: 'Ticket not found', status: 404 };

  const { ticket, ctx } = context;
  if (ticket.status !== 'valid') {
    return { error: 'Ticket is not eligible for resale', status: 409 };
  }

  const resaleEnabled = ctx.tier_resale_enabled ?? ctx.resale_enabled;
  if (!resaleEnabled) {
    return { error: 'Resale is not enabled for this event', status: 403 };
  }

  if (!ctx.is_transferable) {
    return { error: 'This tier is non-transferable', status: 403 };
  }

  const user = await findUserById(params.userId);
  if (!user) return { error: 'User not found', status: 404 };

  if (await isWalletBlacklisted(user.wallet_address)) {
    await logFraud({
      eventType: 'blacklisted_wallet_attempt',
      severity: 'high',
      userId: params.userId,
      walletAddress: user.wallet_address,
      ticketId: params.ticketId,
    });
    return { error: 'Wallet is blacklisted', status: 403 };
  }

  const capBps = ctx.tier_resale_cap_bps ?? ctx.resale_price_cap_bps ?? 15000;
  const facePrice = BigInt(ctx.price_wei);
  const maxPriceWei = (facePrice * BigInt(capBps)) / 10000n;
  const askPrice = BigInt(parsed.data.askPriceWei);

  if (askPrice > maxPriceWei) {
    return { error: `Ask price exceeds cap (${maxPriceWei.toString()} wei)`, status: 400 };
  }

  const existing = await findListingByTicketId(params.ticketId);
  if (existing) {
    return { error: 'Ticket is already listed', status: 409 };
  }

  let onChainListingId: number | undefined;
  let listTxHash: string | null = null;
  if (isMarketplaceConfigured() && ctx.contract_address) {
    try {
      const onChain = await listTicketOnChain({
        ticketContract: ctx.contract_address,
        tokenId: ticket.tierIndex,
        tierId: ticket.tierIndex,
        askPriceWei: parsed.data.askPriceWei,
        maxPriceWei: maxPriceWei.toString(),
      });
      onChainListingId = onChain.listingId;
      listTxHash = onChain.txHash ?? null;
    } catch (err) {
      console.warn('[marketplace] on-chain list failed; continuing custodial DB listing:', err);
    }
  }

  const listing = await createListing({
    ticketId: params.ticketId,
    eventId: ticket.eventId,
    tierId: ticket.tierId,
    sellerUserId: params.userId,
    sellerWallet: ticket.ownerWalletAddress,
    facePriceWei: ctx.price_wei,
    askPriceWei: parsed.data.askPriceWei,
    maxPriceWei: maxPriceWei.toString(),
    onChainListingId,
  });

  await pool.query(
    `UPDATE tickets SET status = 'listed_for_resale', updated_at = NOW() WHERE id = $1`,
    [params.ticketId]
  );

  await writeAuditLog({
    action: 'listed',
    entityType: 'resale_listing',
    entityId: listing.id,
    performedById: params.userId,
    changes: { ticketId: params.ticketId, askPriceWei: parsed.data.askPriceWei },
  });

  return {
    listing: mapListing(listing),
    transactionHash: listTxHash,
    explorerUrl: listTxHash ? getExplorerTxUrl(listTxHash) : null,
  };
}

export async function cancelResaleListing(params: {
  userId: string;
  ticketId: string;
}): Promise<{ success: true } | { error: string; status: number }> {
  const listing = await findListingByTicketId(params.ticketId);
  if (!listing || listing.seller_user_id !== params.userId) {
    return { error: 'Active listing not found', status: 404 };
  }

  if (listing.on_chain_listing_id && isMarketplaceConfigured()) {
    try {
      await cancelListingOnChain(listing.on_chain_listing_id);
    } catch {
      // Continue with off-chain cancel
    }
  }

  await cancelListing(listing.id);
  await pool.query(
    `UPDATE tickets SET status = 'valid', updated_at = NOW() WHERE id = $1`,
    [params.ticketId]
  );

  return { success: true };
}

export async function buyResaleListing(params: {
  userId: string;
  listingId: string;
}): Promise<
  | { success: true; transactionHash: string | null; explorerUrl: string | null }
  | { error: string; status: number }
> {
  const listing = await findListingById(params.listingId);
  if (!listing || listing.status !== 'active') {
    return { error: 'Listing not found or inactive', status: 404 };
  }

  if (listing.seller_user_id === params.userId) {
    return { error: 'Cannot buy your own listing', status: 400 };
  }

  const buyer = await findUserById(params.userId);
  if (!buyer) return { error: 'Buyer not found', status: 404 };

  if (await isWalletBlacklisted(buyer.wallet_address)) {
    return { error: 'Buyer wallet is blacklisted', status: 403 };
  }

  const ticket = await findTicketById(listing.ticket_id);
  if (!ticket) return { error: 'Ticket not found', status: 404 };

  let txHash: string | null = null;
  if (listing.on_chain_listing_id && isMarketplaceConfigured()) {
    try {
      txHash = await buyTicketOnChain({
        listingId: listing.on_chain_listing_id,
        askPriceWei: listing.ask_price_wei,
      });
    } catch {
      // Fall through to custodial transfer
    }
  }

  if (!txHash && ticket.contractAddress) {
    try {
      txHash = await adminTransferOnChain({
        contractAddress: ticket.contractAddress,
        fromWallet: listing.seller_wallet,
        toWallet: buyer.wallet_address,
        tierIndex: ticket.tierIndex,
      });
    } catch {
      // DB-only transfer for dev
    }
  }

  const newQrSecret = randomBytes(32).toString('hex');
  await connectRedis();
  await redisClient.set(`qr:invalidated:${listing.ticket_id}`, '1', { EX: 120 });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await markListingSold({
      listingId: listing.id,
      buyerUserId: params.userId,
      salePriceWei: listing.ask_price_wei,
    });

    await client.query(
      `UPDATE tickets SET
         owner_user_id = $1,
         owner_wallet_address = $2,
         qr_secret = $3,
         status = 'valid',
         updated_at = NOW()
       WHERE id = $4`,
      [params.userId, buyer.wallet_address.toLowerCase(), newQrSecret, listing.ticket_id]
    );

    await client.query(
      `INSERT INTO ticket_transfers (
         ticket_id, event_id, from_user_id, from_wallet_address,
         to_user_id, to_wallet_address, transfer_type, sale_price_wei,
         transaction_hash, status
       ) VALUES ($1,$2,$3,$4,$5,$6,'resale',$7,$8,'confirmed')`,
      [
        listing.ticket_id,
        listing.event_id,
        listing.seller_user_id,
        listing.seller_wallet,
        params.userId,
        buyer.wallet_address.toLowerCase(),
        listing.ask_price_wei,
        txHash,
      ]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await writeAuditLog({
    action: 'purchased',
    entityType: 'resale_listing',
    entityId: listing.id,
    performedById: params.userId,
    changes: { ticketId: listing.ticket_id, salePriceWei: listing.ask_price_wei },
  });

  return {
    success: true as const,
    transactionHash: txHash,
    explorerUrl: txHash ? getExplorerTxUrl(txHash) : null,
  };
}
