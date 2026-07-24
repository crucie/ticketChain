import { env } from '../config/env.js';
import { checkInTicketOnChain } from '../shared/blockchain/event-contract.service.js';
import {
  listPendingCheckinChainJobs,
  updateCheckinChainTx,
} from '../modules/volunteer/volunteer.repository.js';

/**
 * Retry on-chain check-in records that succeeded off-chain but failed to land a tx.
 */
export async function runCheckinChainConfirm(checkinId?: string): Promise<void> {
  if (!env.MST_DEPLOYER_PRIVATE_KEY) {
    console.warn('[checkin-chain] MST_DEPLOYER_PRIVATE_KEY unset — skipping');
    return;
  }

  const pending = await listPendingCheckinChainJobs(25);
  const jobs = checkinId
    ? pending.filter((j) => j.checkinId === checkinId)
    : pending;

  if (jobs.length === 0) {
    if (checkinId) {
      // Targeted job may already be confirmed or missing contract
      console.log(`[checkin-chain] No pending work for checkin ${checkinId}`);
    }
    return;
  }

  for (const job of jobs) {
    try {
      const txHash = await checkInTicketOnChain({
        contractAddress: job.contractAddress,
        ticketId: job.ticketId,
        ownerWallet: job.ownerWallet,
        tierIndex: job.tierIndex,
      });
      await updateCheckinChainTx({
        checkinId: job.checkinId,
        transactionHash: txHash,
        chainStatus: 'confirmed',
      });
      console.log(`[checkin-chain] Confirmed ${job.checkinId} tx=${txHash}`);
    } catch (err) {
      console.error(`[checkin-chain] Failed ${job.checkinId}:`, err);
      await updateCheckinChainTx({
        checkinId: job.checkinId,
        transactionHash: null,
        chainStatus: 'pending',
      });
      throw err;
    }
  }
}
