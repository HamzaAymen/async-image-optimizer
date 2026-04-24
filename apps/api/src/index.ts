import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { config } from "./config";

const app = express();

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
  },
});

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
]);

app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:3000");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});
app.use(express.json());

app.post("/uploads/presign", async (req: Request, res: Response) => {
  const { contentType, filename } = req.body ?? {};

  if (
    typeof contentType !== "string" ||
    !ALLOWED_CONTENT_TYPES.has(contentType)
  ) {
    return res
      .status(400)
      .json({ error: "Unsupported or missing contentType" });
  }

  let base: string | undefined;
  let ext: string | undefined;
  if (typeof filename === "string" && filename.length > 0) {
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const dot = safe.lastIndexOf(".");
    if (dot > 0) {
      base = safe.slice(0, dot);
      ext = safe.slice(dot + 1);
    } else {
      base = safe;
    }
  }
  const key = `uploads/${randomUUID()}${base ? `-${base}` : ""}${ext ? `.${ext}` : ""}`;

  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: config.r2.bucket,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 60 * 5 },
  );

  res.json({
    url,
    key,
    bucket: config.r2.bucket,
    expiresIn: 300,
    method: "PUT",
  });
});

app.listen(config.port, () => {
  console.log(`api listening on http://localhost:${config.port}`);
});
