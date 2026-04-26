import { Worker } from "bullmq";
import {
  CLEANUP_EVENTS_JOB,
  MAINTENANCE_QUEUE_NAME,
} from "./lib/maintenance-queue";
import { redis } from "./lib/redis";
import { runEventCleanup } from "./maintenance";

export const maintenanceWorker = new Worker(
  MAINTENANCE_QUEUE_NAME,
  async (job) => {
    if (job.name === CLEANUP_EVENTS_JOB) return runEventCleanup();
  },
  { connection: redis, concurrency: 1 },
);

maintenanceWorker.on("failed", (job, err) =>
  console.error(`[maintenance] ${job?.name} failed:`, err),
);
