import { z } from "zod";
import { ALLOWED_CONTENT_TYPES } from "./constants";

const contentType = z.enum(ALLOWED_CONTENT_TYPES);

const dimension = z.number().int().positive().max(10000);

export const presignBodySchema = z.object({
  contentType,
});

export const jobBodySchema = z.object({
  sourceKey: z.string().min(1),
  sourceBucket: z.string().min(1),
  sourceType: contentType,
  sourceSize: z.number().int().nonnegative().nullish(),
  operations: z
    .object({
      width: dimension.nullish(),
      height: dimension.nullish(),
      webp: z.boolean().optional(),
    })
    .nullish(),
});

export type JobBody = z.infer<typeof jobBodySchema>;
