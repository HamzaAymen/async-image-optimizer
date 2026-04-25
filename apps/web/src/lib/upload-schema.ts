import { z } from "zod";

export const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
] as const;

export const MAX_FILE_SIZE = 20 * 1024 * 1024;

const dimension = z
  .union([z.string(), z.number()])
  .transform((v) => (v === "" || v === undefined ? undefined : Number(v)))
  .pipe(z.number().int().positive().max(10000).optional())
  .optional();

export const uploadSchema = z.object({
  file: z
    .instanceof(File, { message: "Select an image" })
    .refine(
      (f) => (ALLOWED_CONTENT_TYPES as readonly string[]).includes(f.type),
      "Unsupported image type",
    )
    .refine((f) => f.size <= MAX_FILE_SIZE, "File must be 20MB or smaller"),
  width: dimension,
  height: dimension,
  webp: z.boolean().default(false),
});

export type UploadFormValues = z.input<typeof uploadSchema>;

export type Operations = {
  width?: number;
  height?: number;
  webp: boolean;
};

export type PresignResponse = {
  url: string;
  key: string;
  bucket: string;
  expiresIn: number;
  method: "PUT";
};
