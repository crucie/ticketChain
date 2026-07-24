import { randomBytes } from 'crypto';
import { z } from 'zod';
import { pool } from '../../shared/db/postgres.service.js';
import {
  adminTransferOnChain,
  getExplorerTxUrl,
} from '../../shared/blockchain/event-contract.service.js';
import { writeAuditLog } from '../../shared/audit/audit-log.service.js';
import { isWalletBlacklisted } from '../../shared/fraud/fraud.service.js';
import { findUserByEmail, findUserById, findUserByWallet } from '../auth/auth.repository.js';
import { findTicketById } from './tickets.repository.js';
import { env } from '../../config/env.js';

const transferBodySchema = z.object({
  recipientEmailOrWallet: z.string().min(3),
});

export async function transferTicket(params: {
  userId: string;
  ticketId: string;
  body: unknown;
}): Promise<
  | { success: true; transactionHash: string | null; explorerUrl: string | null }
  | { error: string; status: number; code?: string }
> {
  const parsed = transferBodySchema.safeParse(params.body);
  if (!parsed.success) {
    return { error: 'Invalid transfer request', status: 400 };
  }

  const ticket = await findTicketById(params.ticketId, params.userId);
  if (!ticket) return { error: 'Ticket not found', status: 404 };

  if (ticket.status !== 'valid') {
    return { error: 'Ticket cannot be transferred', status: 409 };
  }

  const tierResult = await pool.query<{ is_transferable: boolean }>(
    `SELECT is_transferable FROM ticket_tiers WHERE id = $1`,
    [ticket.tierId]
  );
  if (!tierResult.rows[0]?.is_transferable) {
    return { error: 'This tier is non-transferable', status: 403 };
  }

  const sender = await findUserById(params.userId);
  if (!sender) return { error: 'Sender not found', status: 404 };

  if (await isWalletBlacklisted(sender.wallet_address)) {
    return { error: 'Wallet is blacklisted', status: 403 };
  }

  const recipientInput = parsed.data.recipientEmailOrWallet.trim();
  const recipient =
    recipientInput.startsWith('0x')
      ? await findUserByWallet(recipientInput)
      : await findUserByEmail(recipientInput);

  if (!recipient) {
    return { error: 'Recipient not found', status: 404 };
  }

  if (recipient.id === params.userId) {
    return { error: 'Cannot transfer to yourself', status: 400 };
  }

  let txHash: string | null = null;
  if (ticket.contractAddress) {
    if (!env.MST_DEPLOYER_PRIVATE_KEY) {
      return {
        error: 'On-chain transfer unavailable: deployer key not configured',
        status: 503,
        code: 'CHAIN_TRANSFER_UNAVAILABLE',
      };
    }
    try {
      txHash = await adminTransferOnChain({
        contractAddress: ticket.contractAddress,
        fromWallet: ticket.ownerWalletAddress,
        toWallet: recipient.wallet_address,
        tierIndex: ticket.tierIndex,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'On-chain transfer failed';
      return {
        error: `On-chain transfer failed: ${message}`,
        status: 502,
        code: 'CHAIN_TRANSFER_FAILED',
      };
    }
  }

  const newQrSecret = randomBytes(32).toString('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE tickets SET
         owner_user_id = $1,
         owner_wallet_address = $2,
         qr_secret = $3,
         status = 'valid',
         updated_at = NOW()
       WHERE id = $4`,
      [recipient.id, recipient.wallet_address.toLowerCase(), newQrSecret, params.ticketId]
    );

    await client.query(
      `INSERT INTO ticket_transfers (
         ticket_id, event_id, from_user_id, from_wallet_address,
         to_user_id, to_wallet_address, transfer_type, transaction_hash, status
       ) VALUES ($1,$2,$3,$4,$5,$6,'gift',$7,'confirmed')`,
      [
        params.ticketId,
        ticket.eventId,
        params.userId,
        ticket.ownerWalletAddress,
        recipient.id,
        recipient.wallet_address.toLowerCase(),
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
    action: 'gifted',
    entityType: 'ticket',
    entityId: params.ticketId,
    performedById: params.userId,
    changes: { toUserId: recipient.id, transactionHash: txHash },
  });

  return {
    success: true,
    transactionHash: txHash,
    explorerUrl: txHash ? getExplorerTxUrl(txHash) : null,
  };
}
