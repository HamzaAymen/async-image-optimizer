import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Router } from "express";
import { config } from "../config";
import { s3 } from "../lib/r2";
import { buildUploadKey } from "../lib/keys";
import { parseBody } from "../lib/validate";
import { presignBodySchema } from "../schemas";

const PRESIGN_EXPIRES_IN = 60 * 5;

export const uploadsRouter = Router();

uploadsRouter.post("/presign", async (req, res) => {
  const body = parseBody(presignBodySchema, req, res);
  if (!body) return;

  const key = buildUploadKey();

  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: config.r2.bucket,
      Key: key,
      ContentType: body.contentType,
    }),
    { expiresIn: PRESIGN_EXPIRES_IN },
  );

  res.json({
    url,
    key,
    bucket: config.r2.bucket,
    expiresIn: PRESIGN_EXPIRES_IN,
    method: "PUT",
  });
});
