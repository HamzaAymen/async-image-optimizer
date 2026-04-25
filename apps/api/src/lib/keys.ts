import { randomUUID } from "node:crypto";

export function buildUploadKey(): string {
  return `uploads/${randomUUID().replace(/-/g, "")}`;
}
