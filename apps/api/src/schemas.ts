import { z } from "zod";
import { ALLOWED_CONTENT_TYPES, MAX_UPLOAD_BYTES } from "./constants";

const contentType = z.enum(ALLOWED_CONTENT_TYPES);

const dimension = z.number().int().positive().max(10000);

const uploadByteSize = z
  .number()
  .int()
  .positive()
  .max(MAX_UPLOAD_BYTES, `File must be ${MAX_UPLOAD_BYTES} bytes or smaller`);

export const presignBodySchema = z.object({
  contentType,
  contentLength: uploadByteSize,
});

export const jobBodySchema = z.object({
  sourceKey: z.string().min(1),
  sourceBucket: z.string().min(1),
  sourceType: contentType,
  sourceSize: uploadByteSize.nullish(),
  operations: z
    .object({
      width: dimension.nullish(),
      height: dimension.nullish(),
      webp: z.boolean().optional(),
    })
    .nullish(),
});

export type JobBody = z.infer<typeof jobBodySchema>;
