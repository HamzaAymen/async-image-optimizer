import { Queue } from "bullmq";
import { redis } from "./redis";

export const MAINTENANCE_QUEUE_NAME = "maintenance";
export const CLEANUP_EVENTS_JOB = "cleanup-events";

export const maintenanceQueue = new Queue(MAINTENANCE_QUEUE_NAME, {
  connection: redis,
});

export async function registerMaintenanceSchedules() {
  await maintenanceQueue.upsertJobScheduler(
    "cleanup-events-every-minute",
    { pattern: "*/1 * * * *" },
    {
      name: CLEANUP_EVENTS_JOB,
      opts: { removeOnComplete: 50, removeOnFail: 100 },
    },
  );
}
