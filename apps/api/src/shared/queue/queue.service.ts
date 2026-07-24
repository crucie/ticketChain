import { Queue, Worker, type Job, type ConnectionOptions } from 'bullmq';
import { env } from '../../config/env.js';

const connection: ConnectionOptions = {
  url: env.REDIS_URL,
};

export const QUEUE_NAMES = {
  MAINTENANCE: 'ticketchain-maintenance',
} as const;

export const JOB_NAMES = {
  ORPHAN_RECONCILE: 'orphan-reconcile',
  SETTLEMENT_CREATE: 'settlement-create',
  CHECKIN_CHAIN_CONFIRM: 'checkin-chain-confirm',
} as const;

let maintenanceQueue: Queue | null = null;

export function getMaintenanceQueue(): Queue {
  if (!maintenanceQueue) {
    maintenanceQueue = new Queue(QUEUE_NAMES.MAINTENANCE, { connection });
  }
  return maintenanceQueue;
}

export function createWorker(
  processor: (job: Job) => Promise<void>
): Worker {
  return new Worker(QUEUE_NAMES.MAINTENANCE, processor, { connection });
}

export async function scheduleRecurringJobs(): Promise<void> {
  const queue = getMaintenanceQueue();
  await queue.add(
    JOB_NAMES.ORPHAN_RECONCILE,
    {},
    {
      repeat: { every: 5 * 60 * 1000 },
      removeOnComplete: 50,
      removeOnFail: 100,
    }
  );
  await queue.add(
    JOB_NAMES.CHECKIN_CHAIN_CONFIRM,
    {},
    {
      repeat: { every: 2 * 60 * 1000 },
      removeOnComplete: 50,
      removeOnFail: 100,
    }
  );
}
