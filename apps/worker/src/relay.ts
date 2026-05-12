import { Queue } from "bullmq";
import { EventType, JobStatus, prisma } from "db";
import { IMAGE_JOB_NAME, IMAGE_QUEUE_NAME, type ImageJobPayload } from "queue";
import { redis } from "./lib/redis";

const BATCH_SIZE = 100;

const producer = new Queue<ImageJobPayload>(IMAGE_QUEUE_NAME, {
  connection: redis,
});

export async function runRelay(): Promise<{ enqueued: number }> {
  const pending = await prisma.event.findMany({
    where: { publishedAt: null, type: EventType.JOB_CREATED },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  });
  if (pending.length === 0) return { enqueued: 0 };

  let enqueued = 0;
  for (const event of pending) {
    try {
      // BullMQ dedups on jobId, so a retried enqueue after a relay crash
      // is a no-op — that's why we can mark publishedAt afterwards.
      await producer.add(
        IMAGE_JOB_NAME,
        { jobId: event.jobId },
        {
          jobId: event.jobId,
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        },
      );

      await prisma.$transaction(async (tx) => {
        await tx.event.update({
          where: { id: event.id },
          data: { publishedAt: new Date() },
        });
        // Only flip to QUEUED if still PENDING — tiny inputs can race
        // through RUNNING/COMPLETED before this update lands.
        const { count } = await tx.job.updateMany({
          where: { id: event.jobId, status: JobStatus.PENDING },
          data: { status: JobStatus.QUEUED },
        });
        if (count > 0) {
          await tx.event.create({
            data: {
              jobId: event.jobId,
              type: EventType.JOB_QUEUED,
              payload: {},
              publishedAt: new Date(),
            },
          });
        }
      });
      enqueued++;
    } catch (err) {
      console.error(
        `[relay] failed to relay event ${event.id} (job ${event.jobId}):`,
        err,
      );
    }
  }
  return { enqueued };
}

export async function closeRelay(): Promise<void> {
  await producer.close();
}
