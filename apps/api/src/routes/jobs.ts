import { EventType, JobStatus, prisma } from "db";
import { Router } from "express";
import { IMAGE_JOB_NAME } from "queue";
import { imageQueue } from "../lib/queue";
import { parseBody } from "../lib/validate";
import { jobBodySchema, type JobBody } from "../schemas";

export const jobsRouter = Router();

jobsRouter.post("/", async (req, res) => {
  const body = parseBody(jobBodySchema, req, res);
  if (!body) return;

  const job = await prisma.job.create({
    data: {
      sourceKey: body.sourceKey,
      sourceBucket: body.sourceBucket,
      sourceType: body.sourceType,
      sourceSize: body.sourceSize ?? null,
      operations: normalizeOperations(body.operations),
    },
  });

  await prisma.event.create({
    data: { jobId: job.id, type: EventType.JOB_CREATED, payload: {} },
  });

  try {
    await imageQueue.add(
      IMAGE_JOB_NAME,
      { jobId: job.id },
      {
        jobId: job.id,
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
      },
    );
  } catch (err) {
    res.status(503).json({
      error: "Failed to enqueue job",
      jobId: job.id,
      detail: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  const queued = await prisma.job.update({
    where: { id: job.id },
    data: { status: JobStatus.QUEUED },
  });

  await prisma.event.create({
    data: { jobId: job.id, type: EventType.JOB_QUEUED, payload: {} },
  });

  res.status(201).json(queued);
});

function normalizeOperations(operations: JobBody["operations"]) {
  if (!operations) return undefined;
  const out: { width?: number; height?: number; webp: boolean } = {
    webp: Boolean(operations.webp),
  };
  if (operations.width != null) out.width = operations.width;
  if (operations.height != null) out.height = operations.height;
  return out;
}
