import { api } from "./api";
import type { Operations, PresignResponse } from "./upload-schema";

export type CreatedJob = {
  id: string;
  status: "PENDING" | "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
};

export type UploadResult = {
  presign: PresignResponse;
  job: CreatedJob;
};

export async function uploadImage(
  file: File,
  operations: Operations,
): Promise<UploadResult> {
  const presign = await api
    .post("uploads/presign", {
      json: { contentType: file.type },
      retry: {
        limit: 2,
        methods: ["post"],
        statusCodes: [408, 502, 503, 504],
      },
    })
    .json<PresignResponse>();

  const putRes = await fetch(presign.url, {
    method: presign.method,
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!putRes.ok) {
    throw new Error(`Upload failed (${putRes.status})`);
  }

  const job = await api
    .post("jobs", {
      json: {
        sourceKey: presign.key,
        sourceBucket: presign.bucket,
        sourceType: file.type,
        sourceSize: file.size,
        operations,
      },
    })
    .json<CreatedJob>();

  return { presign, job };
}
