import { QueueEvents } from "bullmq";
import { JobStatus, prisma } from "db";
import { EventEmitter } from "node:events";
import { IMAGE_QUEUE_NAME } from "queue";
import { redis } from "./redis";

export const jobBus = new EventEmitter();
jobBus.setMaxListeners(0);

export const queueEvents = new QueueEvents(IMAGE_QUEUE_NAME, {
  connection: redis.duplicate(),
});

queueEvents.on("active", ({ jobId }) => {
  jobBus.emit(jobId);
});
queueEvents.on("completed", ({ jobId }) => {
  jobBus.emit(jobId);
});
queueEvents.on("progress", ({ jobId }) => {
  jobBus.emit(jobId);
});

queueEvents.on("failed", async ({ jobId, failedReason }) => {
  jobBus.emit(jobId);

  // Backstop: if the worker was OOM-killed or otherwise died before writing
  // FAILED, the DB row stays in RUNNING/QUEUED forever and SSE clients hang
  // on "optimizing". Reconcile from the API process so terminal state is
  // guaranteed even when the worker is gone.
  try {
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return;
    if (
      job.status === JobStatus.COMPLETED ||
      job.status === JobStatus.FAILED ||
      job.status === JobStatus.CANCELLED
    ) {
      return;
    }
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.FAILED,
        error: (failedReason ?? "Job failed without explicit reason").slice(
          0,
          4000,
        ),
      },
    });
    jobBus.emit(jobId);
  } catch (err) {
    console.error("[queue-events] failed-backstop write error", err);
  }
});

queueEvents.on("error", (err) => {
  console.error("QueueEvents error", err);
});
