import { randomUUID } from "node:crypto";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createSession } from "better-sse";
import { EventType, JobStatus, prisma, type Job } from "db";
import { Router } from "express";
import { config } from "../config";
import { s3 } from "../lib/r2";
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

  // Pre-generate the id so we can pipeline both inserts in a batched
  // $transaction. An interactive transaction here would serialize the
  // INSERTs across separate round trips, which over the Neon WS adapter
  // routinely blows the default 5s timeout.
  const id = randomUUID();
  const [job] = await prisma.$transaction([
    prisma.job.create({
      data: {
        id,
        sourceKey: body.sourceKey,
        sourceBucket: body.sourceBucket,
        sourceType: body.sourceType,
        sourceSize: body.sourceSize ?? null,
        operations: normalizeOperations(body.operations),
      },
    }),
    prisma.event.create({
      data: {
        jobId: id,
        type: EventType.JOB_CREATED,
        payload: {},
      },
    }),
  ]);

  res.status(201).json(job);
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
