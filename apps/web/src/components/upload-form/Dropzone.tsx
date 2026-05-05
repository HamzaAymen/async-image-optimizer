"use client";

import { useEffect, useMemo } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { UploadCloud } from "lucide-react";
import {
  ALLOWED_CONTENT_TYPES,
  MAX_FILE_SIZE,
} from "@/lib/upload-schema";
import { formatBytes } from "@/lib/format";

const accept = Object.fromEntries(
  ALLOWED_CONTENT_TYPES.map((type) => [type, []]),
);

type DropzoneProps = {
  value?: File | null;
  onChange: (file: File) => void;
};

function describeRejection(rejection: FileRejection): string {
  const code = rejection.errors[0]?.code;
  if (code === "file-too-large") {
    return `${rejection.file.name} is ${formatBytes(rejection.file.size)}. Maximum size is ${formatBytes(MAX_FILE_SIZE)}.`;
  }
  if (code === "file-invalid-type") {
    return `${rejection.file.name} is not a supported image type.`;
  }
  if (code === "too-many-files") {
    return "Only one file can be uploaded at a time.";
  }
  return rejection.errors[0]?.message ?? "File rejected.";
}

export function Dropzone({ value, onChange }: DropzoneProps) {
  const previewUrl = useMemo(
    () => (value ? URL.createObjectURL(value) : null),
    [value],
  );

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const { getRootProps, getInputProps, isDragActive, fileRejections } =
    useDropzone({
      accept,
      maxFiles: 1,
      maxSize: MAX_FILE_SIZE,
      onDrop: (accepted) => {
        if (accepted[0]) onChange(accepted[0]);
      },
    });

  const rejection = fileRejections[0];

  const className = useMemo(
    () =>
      [
        "group relative flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center transition-colors cursor-pointer",
        rejection
          ? "border-status-failed/60 bg-status-failed/5"
          : isDragActive
            ? "border-foreground/40 bg-background"
            : "border-border bg-background/60 hover:bg-background",
      ].join(" "),
    [isDragActive, rejection],
  );

  return (
    <div className="flex flex-col gap-2">
      <div {...getRootProps({ className })}>
        <input {...getInputProps()} />
        {previewUrl && value ? (
          <div className="flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Preview"
              className="h-32 w-32 rounded-lg object-cover ring-1 ring-border"
            />
            <div className="flex flex-col items-center">
              <span className="text-sm font-medium text-foreground">
                {value.name}
              </span>
              <span className="text-xs text-muted">
                {formatBytes(value.size)}
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
                <span className="underline underline-offset-2">browse</span>
              </span>
              <span className="text-xs text-muted">
                JPEG, PNG, WebP, AVIF, GIF — up to {formatBytes(MAX_FILE_SIZE)}
              </span>
            </div>
          </>
        )}
      </div>
      {rejection && (
        <p
          role="alert"
          className="text-sm text-status-failed"
        >
          {describeRejection(rejection)}
        </p>
      )}
    </div>
  );
}
