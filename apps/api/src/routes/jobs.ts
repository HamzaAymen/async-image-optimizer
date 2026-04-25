import { prisma } from "db";
import { Router } from "express";
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
  res.status(201).json(job);
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
