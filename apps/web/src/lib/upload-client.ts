import { api } from "./api";
import type { Operations, PresignResponse } from "./upload-schema";

export async function uploadImage(
  file: File,
  operations: Operations,
): Promise<PresignResponse> {
  const presign = await api
    .post("uploads/presign", {
      json: { contentType: file.type },
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

  await api.post("jobs", {
    json: {
      sourceKey: presign.key,
      sourceBucket: presign.bucket,
      sourceType: file.type,
      sourceSize: file.size,
      operations,
    },
  });

  return presign;
}
