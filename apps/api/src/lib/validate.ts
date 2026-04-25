import type { Request, Response } from "express";
import type { ZodType } from "zod";

export function parseBody<T>(
  schema: ZodType<T>,
  req: Request,
  res: Response,
): T | null {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.join(".");
    res.status(400).json({
      error: path ? `${issue?.message} (${path})` : issue?.message,
    });
    return null;
  }
  return result.data;
}
