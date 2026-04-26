"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import {
  uploadSchema,
  type Operations,
  type UploadFormValues,
} from "@/lib/upload-schema";
import { uploadImage } from "@/lib/upload-client";
import { Dropzone } from "./Dropzone";
import { DimensionFields } from "./DimensionFields";
import { JobStatus } from "./JobStatus";
import { StatusBanner } from "./StatusBanner";

function toOperations(values: UploadFormValues): Operations {
  const ops: Operations = { webp: Boolean(values.webp) };
  const w =
    values.width === "" || values.width == null ? undefined : Number(values.width);
  const h =
    values.height === "" || values.height == null ? undefined : Number(values.height);
  if (w) ops.width = w;
  if (h) ops.height = h;
  return ops;
}

export function UploadForm() {
  const {
    control,
    handleSubmit,
    watch,
    register,
    formState: { errors },
    reset,
  } = useForm<UploadFormValues>({
    resolver: zodResolver(uploadSchema),
    defaultValues: { webp: false },
  });

  const file = watch("file");

  const [jobId, setJobId] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (values: UploadFormValues) =>
      uploadImage(values.file as File, toOperations(values)),
    onSuccess: ({ job }) => {
      setJobId(job.id);
      reset({ webp: false });
    },
  });

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
            render={({ field: { onChange, value } }) => (
              <Dropzone value={value as File | undefined} onChange={onChange} />
            )}
          />

          {errors.file && (
            <p className="text-sm text-status-failed">{errors.file.message}</p>
          )}

          <DimensionFields register={register} errors={errors} />

          <label className="flex items-center gap-2 select-none">
            <input
              type="checkbox"
              {...register("webp")}
              className="h-4 w-4 rounded border-border accent-foreground"
            />
            <span className="text-sm text-foreground">Convert to WebP</span>
          </label>

          <button
            type="submit"
            disabled={mutation.isPending || !file}
            className="inline-flex h-11 items-center cursor-pointer justify-center rounded-lg bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {mutation.isPending ? "Uploading…" : "Upload image"}
          </button>

          {mutation.isError && (
            <StatusBanner variant="error">{mutation.error.message}</StatusBanner>
          )}
          {jobId && <JobStatus jobId={jobId} />}
        </form>
      </div>
    </main>
  );
}
