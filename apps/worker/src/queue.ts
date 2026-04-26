import { Worker } from "bullmq";
import { EventType, JobStatus, prisma } from "db";
import { IMAGE_QUEUE_NAME, type ImageJobPayload } from "queue";
import { config } from "./config";
import { maintenanceQueue } from "./lib/maintenance-queue";
import { redis } from "./lib/redis";
import { maintenanceWorker } from "./maintenance-worker";
import { processImageJob } from "./processor";

export const worker = new Worker<ImageJobPayload>(
  IMAGE_QUEUE_NAME,
  processImageJob,
  {
    connection: redis,
    concurrency: config.concurrency,
  },
);

worker.on("completed", (job) => {
  console.log(`[worker] completed job ${job.data.jobId} (bull id ${job.id})`);
});

worker.on("failed", async (job, err) => {
  if (!job) {
    console.error("[worker] job failed (no job ref):", err);
    return;
  }
  const final = job.attemptsMade >= (job.opts.attempts ?? 1);
  console.error(
    `[worker] job ${job.data.jobId} failed (attempt ${job.attemptsMade}/${job.opts.attempts}, final=${final}):`,
    err.message,
  );
  if (!final) return;

  const errorText = String(err.stack ?? err.message ?? err).slice(0, 4000);
  try {
    await prisma.job.update({
      where: { id: job.data.jobId },
      data: { status: JobStatus.FAILED, error: errorText },
    });
    await prisma.event.create({
      data: {
        jobId: job.data.jobId,
        type: EventType.JOB_FAILED,
        payload: { error: errorText, attempts: job.attemptsMade },
      },
    });
  } catch (dbErr) {
    console.error("[worker] failed to write FAILED state to DB:", dbErr);
  }
});

worker.on("error", (err) => {
  console.error("[worker] worker error:", err);
});

export async function shutdown(): Promise<void> {
  await Promise.all([worker.close(), maintenanceWorker.close()]);
  await maintenanceQueue.close();
  await redis.quit();
}
