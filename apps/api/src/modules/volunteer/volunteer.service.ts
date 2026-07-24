import { createHash } from 'crypto';
import { z } from 'zod';
import { pool } from '../../shared/db/postgres.service.js';
import { connectRedis, redisClient } from '../../shared/cache/redis.service.js';
import { verifyQrSignature } from '../tickets/tickets.service.js';
import { parsePagination } from '../../shared/utils/pagination.js';
import {
  checkInTicketOnChain,
  getExplorerTxUrl,
} from '../../shared/blockchain/event-contract.service.js';
import { getMaintenanceQueue, JOB_NAMES } from '../../shared/queue/queue.service.js';
import {
  findVolunteerAssignment,
  findVolunteerAssignments,
  findVolunteerEventDetail,
  findTicketForCheckin,
  insertCheckin,
  markTicketUsed,
  incrementCheckedIn,
  updateCheckinChainTx,
  getCheckinStats as repoGetCheckinStats,
  getCheckinHistory as repoGetCheckinHistory,
  getValidTicketIds,
} from './volunteer.repository.js';
import type { VolunteerCheckinResult } from '@ticketchain/shared';
import { env } from '../../config/env.js';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const QR_MAX_AGE_SECONDS = 90;

/* ------------------------------------------------------------------ */
/*  Schemas                                                           */
/* ------------------------------------------------------------------ */

const verifyBodySchema = z.object({
  qrPayload: z.string().min(1),
  deviceId: z.string().optional(),
  scanMethod: z.enum(['qr', 'nfc', 'manual']).default('qr'),
});

/* ------------------------------------------------------------------ */
/*  Core verification & check-in                                      */
/* ------------------------------------------------------------------ */

export async function verifyAndCheckin(params: {
  volunteerId: string;
  body: unknown;
}): Promise<
  | { result: VolunteerCheckinResult }
  | { error: string; status: number; code?: string }
> {
  /* ---- 0. Parse request body ---- */
  const parsed = verifyBodySchema.safeParse(params.body);
  if (!parsed.success) {
    return { error: 'Invalid request body', status: 400, code: 'VALIDATION_ERROR' };
  }
  const { qrPayload, deviceId, scanMethod } = parsed.data;

  /* ---- 1. Decode QR payload ---- */
  let ticketId: string;
  let ts: number;
  let nonce: string;
  let sig: string;

  try {
    const decoded = JSON.parse(Buffer.from(qrPayload, 'base64').toString('utf-8'));
    ticketId = decoded.tid;
    ts = decoded.ts;
    nonce = decoded.n;
    sig = decoded.sig;
    if (!ticketId || !ts || !nonce || !sig) throw new Error('missing fields');
  } catch {
    return { error: 'Malformed QR payload', status: 400, code: 'MALFORMED_QR' };
  }

  /* ---- Helper: log a failed check-in attempt ---- */
  const logFailure = async (
    eventId: string | null,
    code: string,
    reason: string
  ): Promise<{ result: VolunteerCheckinResult }> => {
    // Best-effort log — we still have ticket context
    if (eventId) {
      try {
        const client = await pool.connect();
        try {
          await insertCheckin(client, {
            eventId,
            ticketId,
            checkedInById: params.volunteerId,
            qrSignature: sig,
            qrNonce: nonce,
            qrTimestamp: ts,
            scanMethod,
            verificationSuccess: false,
            failureReason: code,
            zoneAccessed: null,
            deviceId: deviceId ?? null,
          });
        } finally {
          client.release();
        }
      } catch {
        // ignore logging errors
      }
    }
    return {
      result: {
        success: false,
        ticketId,
        eventId: eventId ?? '',
        failureCode: code,
        failureReason: reason,
      },
    };
  };

  /* ---- 2. Look up the ticket ---- */
  const ticket = await findTicketForCheckin(ticketId);
  if (!ticket) {
    return logFailure(null, 'TICKET_NOT_FOUND', 'Ticket does not exist');
  }

  /* ---- 3. Verify HMAC signature ---- */
  const validSig = verifyQrSignature(ticketId, ts, nonce, sig, ticket.qr_secret);
  if (!validSig) {
    return logFailure(ticket.event_id, 'INVALID_SIGNATURE', 'QR code signature is invalid');
  }

  /* ---- 4. Verify nonce in Redis (atomic get+delete) ---- */
  await connectRedis();
  const nonceKey = `qr:nonce:${ticketId}:${nonce}`;
  const nonceValue = await redisClient.getDel(nonceKey);
  if (!nonceValue) {
    return logFailure(
      ticket.event_id,
      'NONCE_EXPIRED',
      'QR code has already been used or expired'
    );
  }

  /* ---- 5. Validate timestamp ---- */
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - ts) > QR_MAX_AGE_SECONDS) {
    return logFailure(
      ticket.event_id,
      'QR_EXPIRED',
      `QR code expired (generated ${Math.abs(nowSeconds - ts)}s ago, max ${QR_MAX_AGE_SECONDS}s)`
    );
  }

  /* ---- 6. Verify ticket status ---- */
  if (ticket.status !== 'valid') {
    return logFailure(
      ticket.event_id,
      'TICKET_INVALID',
      `Ticket status is '${ticket.status}', expected 'valid'`
    );
  }

  /* ---- 7. Verify wallet blacklist ---- */
  if (ticket.wallet_blacklisted) {
    return logFailure(
      ticket.event_id,
      'WALLET_BLACKLISTED',
      'Ticket owner wallet is blacklisted'
    );
  }

  /* ---- 8. Verify volunteer assignment & zone access ---- */
  const assignment = await findVolunteerAssignment(params.volunteerId, ticket.event_id);
  if (!assignment) {
    return logFailure(
      ticket.event_id,
      'NOT_ASSIGNED',
      'You are not assigned to this event'
    );
  }

  const ticketZone = ticket.tier_zone;
  if (
    assignment.permittedZones.length > 0 &&
    ticketZone &&
    !assignment.permittedZones.includes(ticketZone)
  ) {
    return logFailure(
      ticket.event_id,
      'ZONE_MISMATCH',
      `Ticket zone '${ticketZone}' is not in your permitted zones: ${assignment.permittedZones.join(', ')}`
    );
  }

  /* ---- 9. Atomic check-in (DB transaction) ---- */
  const client = await pool.connect();
  let checkinId: string;
  try {
    await client.query('BEGIN');

    // Insert check-in log (unique index prevents double-entry)
    checkinId = await insertCheckin(client, {
      eventId: ticket.event_id,
      ticketId,
      checkedInById: params.volunteerId,
      qrSignature: sig,
      qrNonce: nonce,
      qrTimestamp: ts,
      scanMethod,
      verificationSuccess: true,
      failureReason: null,
      zoneAccessed: ticketZone,
      deviceId: deviceId ?? null,
    });

    // Mark ticket as used (optimistic lock via status = 'valid')
    const updated = await markTicketUsed(client, ticketId, params.volunteerId);
    if (!updated) {
      await client.query('ROLLBACK');
      return logFailure(
        ticket.event_id,
        'ALREADY_USED',
        'Ticket was already checked in (race condition)'
      );
    }

    // Increment event counter
    await incrementCheckedIn(client, ticket.event_id);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');

    // Handle unique constraint violation (double check-in race)
    const pgError = error as { code?: string };
    if (pgError.code === '23505') {
      return logFailure(
        ticket.event_id,
        'ALREADY_USED',
        'Ticket has already been checked in'
      );
    }

    throw error;
  } finally {
    client.release();
  }

  let transactionHash: string | null = null;
  let chainStatus: VolunteerCheckinResult['chainStatus'] = null;
  let explorerUrl: string | null = null;

  if (ticket.contract_address && env.MST_DEPLOYER_PRIVATE_KEY) {
    try {
      transactionHash = await checkInTicketOnChain({
        contractAddress: ticket.contract_address,
        ticketId,
        ownerWallet: ticket.owner_wallet_address,
        tierIndex: ticket.tier_index,
      });
      chainStatus = 'confirmed';
      explorerUrl = getExplorerTxUrl(transactionHash);
      await updateCheckinChainTx({
        checkinId,
        transactionHash,
        chainStatus: 'confirmed',
      });
    } catch (err) {
      console.error('[checkin] on-chain record failed, queuing retry:', err);
      chainStatus = 'pending';
      await updateCheckinChainTx({
        checkinId,
        transactionHash: null,
        chainStatus: 'pending',
      });
      try {
        await getMaintenanceQueue().add(
          JOB_NAMES.CHECKIN_CHAIN_CONFIRM,
          { checkinId },
          {
            attempts: 8,
            backoff: { type: 'exponential', delay: 15_000 },
            removeOnComplete: 100,
            removeOnFail: 50,
          }
        );
      } catch (queueErr) {
        console.error('[checkin] failed to enqueue chain retry:', queueErr);
      }
    }
  }

  /* ---- 10. Publish real-time event via Redis ---- */
  try {
    await redisClient.publish(
      `checkin:live:${ticket.event_id}`,
      JSON.stringify({
        checkinId,
        ticketId,
        zone: ticketZone,
        tier: ticket.tier_name,
        transactionHash,
        timestamp: new Date().toISOString(),
      })
    );
  } catch {
    // non-critical — don't fail the check-in
  }

  return {
    result: {
      success: true,
      ticketId,
      eventId: ticket.event_id,
      checkinId,
      transactionHash,
      chainStatus,
      explorerUrl,
      attendee: {
        walletAddress: ticket.owner_wallet_address,
        ticketTier: ticket.tier_name,
        zone: ticketZone,
        seatNumber: ticket.seat_number,
        tokenId: ticket.token_id,
      },
      checkedInAt: new Date().toISOString(),
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Events assigned to volunteer                                      */
/* ------------------------------------------------------------------ */

export async function getVolunteerEvents(volunteerId: string) {
  const assignments = await findVolunteerAssignments(volunteerId);
  return { assignments };
}

export async function getVolunteerEventDetail(volunteerId: string, eventId: string) {
  const detail = await findVolunteerEventDetail(volunteerId, eventId);
  if (!detail) {
    return { error: 'Event not found or you are not assigned', status: 404 as const };
  }

  return {
    event: {
      id: detail.event.id,
      name: detail.event.name,
      description: detail.event.description,
      eventDate: detail.event.event_date.toISOString(),
      eventEndDate: detail.event.event_end_date?.toISOString() ?? null,
      status: detail.event.status,
      venueName: detail.event.venue_name,
      city: detail.event.city,
      country: detail.event.country,
      zones: detail.event.zones,
      totalTicketsSold: detail.event.total_tickets_sold,
      totalCheckedIn: detail.event.total_checked_in,
      imageIpfsUrl: detail.event.image_ipfs_url,
    },
    permittedZones: detail.assignment.permittedZones,
  };
}

/* ------------------------------------------------------------------ */
/*  Stats                                                             */
/* ------------------------------------------------------------------ */

export async function getCheckinStatsForVolunteer(
  volunteerId: string,
  eventId: string
) {
  // Verify assignment first
  const assignment = await findVolunteerAssignment(volunteerId, eventId);
  if (!assignment) {
    return { error: 'Not assigned to this event', status: 403 as const };
  }

  const stats = await repoGetCheckinStats(eventId);
  if (!stats) {
    return { error: 'Event not found', status: 404 as const };
  }

  return { stats };
}

/* ------------------------------------------------------------------ */
/*  History                                                           */
/* ------------------------------------------------------------------ */

export async function getCheckinHistoryForVolunteer(
  volunteerId: string,
  query: Record<string, string | undefined>
) {
  const { page, limit, offset } = parsePagination(query);
  const eventId = query.eventId;
  const { rows, total } = await repoGetCheckinHistory(volunteerId, eventId, {
    offset,
    limit,
  });
  return { rows, meta: { page, limit, total } };
}

/* ------------------------------------------------------------------ */
/*  Offline snapshot                                                   */
/* ------------------------------------------------------------------ */

export async function generateOfflineSnapshot(
  volunteerId: string,
  eventId: string
) {
  // Verify assignment
  const assignment = await findVolunteerAssignment(volunteerId, eventId);
  if (!assignment) {
    return { error: 'Not assigned to this event', status: 403 as const };
  }

  const ticketIds = await getValidTicketIds(eventId);
  const hashes = ticketIds.map((id) =>
    createHash('sha256').update(id).digest('hex')
  );

  return {
    snapshot: {
      eventId,
      generatedAt: new Date().toISOString(),
      count: hashes.length,
      hashes,
    },
  };
}
