import { EventType, JobStatus, prisma } from "db";
import type { Job } from "bullmq";
import type { ImageJobPayload } from "queue";
import { z } from "zod";
import { config } from "./config";
import { getObject, putObject } from "./lib/r2";
import { runPipeline, type Operations } from "./pipeline";

const payloadSchema = z.object({ jobId: z.string().min(1) });

const operationsSchema = z
  .object({
    width: z.number().int().positive().nullish(),
    height: z.number().int().positive().nullish(),
    webp: z.boolean().optional(),
  })
  .nullish();

export async function processImageJob(
  bullJob: Job<ImageJobPayload>,
): Promise<void> {
  const { jobId } = payloadSchema.parse(bullJob.data);

  const dbJob = await prisma.job.update({
    where: { id: jobId },
    data: {
      status: JobStatus.RUNNING,
      attempts: { increment: 1 },
      error: null,
    },
  });

  await prisma.event.create({
    data: {
      jobId,
      type: EventType.JOB_RUNNING,
      payload: { attempt: bullJob.attemptsMade + 1 },
    },
  });

  const ops = (operationsSchema.parse(dbJob.operations) ?? {}) as Operations;

  const { buffer: input } = await getObject(dbJob.sourceBucket, dbJob.sourceKey);
  const result = await runPipeline(input, ops, dbJob.sourceType);

  const outputKey = `outputs/${dbJob.id}.${result.format}`;
  await putObject(config.r2.bucket, outputKey, result.buffer, result.contentType);

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: JobStatus.COMPLETED,
      outputKey,
      outputSize: result.size,
      outputFormat: result.format,
      error: null,
    },
  });

  await prisma.event.create({
    data: {
      jobId,
      type: EventType.JOB_COMPLETED,
      payload: {
        outputKey,
        outputSize: result.size,
        outputFormat: result.format,
      },
    },
  });
}
