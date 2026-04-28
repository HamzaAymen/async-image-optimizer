import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createSession } from "better-sse";
import { EventType, JobStatus, prisma, type Job } from "db";
import { Router } from "express";
import { IMAGE_JOB_NAME } from "queue";
import { config } from "../config";
import { s3 } from "../lib/r2";
import { imageQueue } from "../lib/queue";
import { jobBus } from "../lib/queue-events";
import { submitJobLimiter } from "../lib/rate-limit";
import { parseBody } from "../lib/validate";
import { jobBodySchema, type JobBody } from "../schemas";

export const jobsRouter = Router();

const TERMINAL_STATUSES: ReadonlySet<JobStatus> = new Set([
  JobStatus.COMPLETED,
  JobStatus.FAILED,
  JobStatus.CANCELLED,
]);

const DOWNLOAD_EXPIRES_IN = 60 * 60;

function isTerminal(status: JobStatus) {
  return TERMINAL_STATUSES.has(status);
}

async function serializeJob(job: Job) {
  const outputUrl =
    job.status === JobStatus.COMPLETED && job.outputKey
      ? await getSignedUrl(
          s3,
          new GetObjectCommand({
            Bucket: config.r2.bucket,
            Key: job.outputKey,
            ResponseContentDisposition: `attachment; filename="${buildDownloadFilename(job)}"`,
          }),
          { expiresIn: DOWNLOAD_EXPIRES_IN },
        )
      : null;

  return {
    id: job.id,
    status: job.status,
    outputKey: job.outputKey,
    outputFormat: job.outputFormat,
    outputSize: job.outputSize,
    outputUrl,
    error: job.error,
    attempts: job.attempts,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function buildDownloadFilename(job: Job) {
  const ext = job.outputFormat ?? "bin";
  return `optimized-${job.id}.${ext}`;
}

jobsRouter.post("/", submitJobLimiter, async (req, res) => {
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

jobsRouter.get("/:id", async (req, res) => {
  const job = await prisma.job.findUnique({ where: { id: req.params.id } });
  if (!job) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(await serializeJob(job));
});

jobsRouter.get("/:id/stream", async (req, res) => {
  const { id } = req.params;

  const initial = await prisma.job.findUnique({ where: { id } });
  if (!initial) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const session = await createSession(req, res, {
    keepAlive: 25_000,
    headers: { "X-Accel-Buffering": "no" },
  });

  const pushStatus = async (job: Job) => {
    session.push(await serializeJob(job), "status");
    if (isTerminal(job.status)) {
      session.push({ status: job.status }, "done");
      return true;
    }
    return false;
  };

  if (await pushStatus(initial)) return;

  const onSignal = async () => {
    try {
      const fresh = await prisma.job.findUnique({ where: { id } });
      if (fresh && session.isConnected) await pushStatus(fresh);
    } catch (err) {
      console.error("SSE onSignal error", err);
    }
  };

  jobBus.on(id, onSignal);
  session.on("disconnected", () => jobBus.off(id, onSignal));
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
