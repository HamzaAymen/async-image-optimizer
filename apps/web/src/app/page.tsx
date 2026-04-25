"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { UploadCloud } from "lucide-react";
import { z } from "zod";

const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
] as const;

const MAX_FILE_SIZE = 20 * 1024 * 1024;

const schema = z.object({
  file: z
    .instanceof(File, { message: "Select an image" })
    .refine(
      (f) => (ALLOWED_CONTENT_TYPES as readonly string[]).includes(f.type),
      "Unsupported image type",
    )
    .refine((f) => f.size <= MAX_FILE_SIZE, "File must be 20MB or smaller"),
});

type FormValues = z.infer<typeof schema>;

type PresignResponse = {
  url: string;
  key: string;
  bucket: string;
  expiresIn: number;
  method: "PUT";
};

const API_URL = process.env.NEXT_PUBLIC_API_URL;

async function uploadImage(file: File): Promise<PresignResponse> {
  const presignRes = await fetch(`${API_URL}/uploads/presign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: file.type, filename: file.name }),
  });
  if (!presignRes.ok) {
    const body = (await presignRes.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? "Failed to get presigned URL");
  }
  const presign = (await presignRes.json()) as PresignResponse;

  const putRes = await fetch(presign.url, {
    method: presign.method,
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!putRes.ok) {
    throw new Error(`Upload failed (${putRes.status})`);
  }

  const jobRes = await fetch(`${API_URL}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sourceKey: presign.key,
      sourceBucket: presign.bucket,
      sourceType: file.type,
      sourceSize: file.size,
    }),
  });
  if (!jobRes.ok) {
    const body = (await jobRes.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? "Failed to create job");
  }

  return presign;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Home() {
  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
    reset,
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const file = watch("file");
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => uploadImage(values.file),
    onSuccess: () => reset(),
  });

  const acceptAttr = useMemo(() => ALLOWED_CONTENT_TYPES.join(","), []);

  return (
    <main className="w-full min-h-dvh flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Upload image
          </h1>
          <p className="text-sm text-muted mt-1">
            JPEG, PNG, WebP, AVIF or GIF — up to 20MB.
          </p>
        </header>

        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(15,15,15,0.04),0_8px_24px_-12px_rgba(15,15,15,0.08)]"
        >
          <Controller
            control={control}
            name="file"
            render={({ field: { onChange, name, ref } }) => (
              <label
                htmlFor="file-input"
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const dropped = e.dataTransfer.files?.[0];
                  if (dropped) onChange(dropped);
                }}
                className={[
                  "group relative flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center transition-colors cursor-pointer",
                  isDragging
                    ? "border-foreground/40 bg-background"
                    : "border-border bg-background/60 hover:bg-background",
                ].join(" ")}
              >
                {previewUrl ? (
                  <div className="flex flex-col items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="h-32 w-32 rounded-lg object-cover ring-1 ring-border"
                    />
                    <div className="flex flex-col items-center">
                      <span className="text-sm font-medium text-foreground">
                        {file?.name}
                      </span>
                      <span className="text-xs text-muted">
                        {file ? formatBytes(file.size) : ""}
                      </span>
                    </div>
                    <span className="text-xs text-muted underline underline-offset-2">
                      Choose a different file
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground/5 text-foreground/70 transition-colors group-hover:bg-foreground/10">
                      <UploadCloud size={20} strokeWidth={1.8} aria-hidden />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium text-foreground">
                        Drop an image here, or{" "}
                        <span className="underline underline-offset-2">
                          browse
                        </span>
                      </span>
                      <span className="text-xs text-muted">
                        JPEG, PNG, WebP, AVIF, GIF
                      </span>
                    </div>
                  </>
                )}
                <input
                  id="file-input"
                  type="file"
                  accept={acceptAttr}
                  name={name}
                  ref={ref}
                  onChange={(e) => onChange(e.target.files?.[0])}
                  className="sr-only"
                />
              </label>
            )}
          />

          {errors.file && (
            <p className="text-sm text-status-failed">{errors.file.message}</p>
          )}

          <button
            type="submit"
            disabled={mutation.isPending || !file}
            className="inline-flex h-11 items-center cursor-pointer justify-center rounded-lg bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {mutation.isPending ? "Uploading…" : "Upload image"}
          </button>

          {mutation.isError && (
            <div className="rounded-lg border border-status-failed/20 bg-status-failed-bg px-3 py-2 text-sm text-status-failed">
              {mutation.error.message}
            </div>
          )}
          {mutation.isSuccess && (
            <div className="rounded-lg border border-status-completed/20 bg-status-completed-bg px-3 py-2 text-sm text-status-completed">
              Uploaded as <code className="font-mono">{mutation.data.key}</code>
            </div>
          )}
        </form>
      </div>
    </main>
  );
}
