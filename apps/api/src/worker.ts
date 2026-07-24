/**
 * worker.ts — BullMQ background job entry point
 *
 * Start with:  pnpm --filter @ticketchain/api worker:dev
 */

import 'dotenv/config';
import type { Job } from 'bullmq';
import {
  createWorker,
  JOB_NAMES,
  scheduleRecurringJobs,
} from './shared/queue/queue.service.js';
import { runOrphanReconciliation } from './workers/orphan-reconcile.worker.js';
import { runCheckinChainConfirm } from './workers/checkin-chain.worker.js';

async function processJob(job: Job): Promise<void> {
  switch (job.name) {
    case JOB_NAMES.ORPHAN_RECONCILE:
      await runOrphanReconciliation();
      break;
    case JOB_NAMES.CHECKIN_CHAIN_CONFIRM: {
      const checkinId =
        typeof job.data?.checkinId === 'string' ? job.data.checkinId : undefined;
      await runCheckinChainConfirm(checkinId);
      break;
    }
    default:
      console.warn(`[worker] Unknown job: ${job.name}`);
  }
}

async function startWorker(): Promise<void> {
  console.log('TicketChain Worker starting (BullMQ)...');

  const worker = createWorker(async (job) => {
    try {
      await processJob(job);
    } catch (err) {
      console.error(`[worker] Job ${job.name} failed:`, err);
      throw err;
    }
  });

  worker.on('completed', (job) => {
    console.log(`[worker] Job ${job.name} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[worker] Job ${job?.name ?? 'unknown'} failed:`, err.message);
  });

  await scheduleRecurringJobs();
  await runOrphanReconciliation().catch((err: unknown) => {
    console.error('[worker] Initial orphan reconciliation failed:', err);
  });

  console.log('TicketChain Worker running. Press Ctrl+C to stop.');
}

process.on('SIGTERM', () => {
  console.log('[worker] SIGTERM received — shutting down gracefully.');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[worker] SIGINT received — shutting down gracefully.');
  process.exit(0);
});

void startWorker();
