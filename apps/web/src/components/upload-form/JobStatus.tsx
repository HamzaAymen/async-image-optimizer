"use client";

import { useJobStatus, type JobStatus as JobStatusType } from "@/lib/use-job-status";
import { formatBytes } from "@/lib/format";

type Tone = "neutral" | "queued" | "running" | "completed" | "failed";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "border-border bg-surface text-muted",
  queued: "border-status-queued/20 bg-status-queued-bg text-foreground",
  running: "border-status-running/20 bg-status-running-bg text-status-running",
  completed:
    "border-status-completed/20 bg-status-completed-bg text-status-completed",
  failed: "border-status-failed/20 bg-status-failed-bg text-status-failed",
};

const DOT_CLASSES: Record<Tone, string> = {
  neutral: "bg-muted",
  queued: "bg-status-queued",
  running: "bg-status-running animate-pulse",
  completed: "bg-status-completed",
  failed: "bg-status-failed",
};

const STATUS_TONE: Record<JobStatusType, Tone> = {
  PENDING: "queued",
  QUEUED: "queued",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "failed",
};

const STATUS_LABEL: Record<JobStatusType, string> = {
  PENDING: "Pending",
  QUEUED: "Queued",
  RUNNING: "Optimizing",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

type JobStatusProps = {
  jobId: string;
};

export function JobStatus({ jobId }: JobStatusProps) {
  const { snapshot, error } = useJobStatus(jobId);

  if (error && !snapshot) {
    return <Card tone="failed" label="Connection lost" detail={error} />;
  }

  if (!snapshot) {
    return <Card tone="neutral" label="Connecting…" />;
  }

  const tone = STATUS_TONE[snapshot.status];
  const label = STATUS_LABEL[snapshot.status];

  if (snapshot.status === "FAILED" || snapshot.status === "CANCELLED") {
    const attempts =
      snapshot.attempts > 0
        ? `${snapshot.attempts} attempt${snapshot.attempts === 1 ? "" : "s"}`
        : null;
    return (
      <Card
        tone={tone}
        label={label}
        detail={snapshot.error ?? "Job failed"}
        meta={attempts}
      />
    );
  }

  if (snapshot.status === "COMPLETED" && snapshot.outputUrl) {
    return (
      <CompletedCard
        url={snapshot.outputUrl}
        format={snapshot.outputFormat}
        size={snapshot.outputSize}
      />
    );
  }

  return <Card tone={tone} label={label} />;
}

type CardProps = {
  tone: Tone;
  label: string;
  detail?: string | null;
  meta?: string | null;
};

function Card({ tone, label, detail, meta }: CardProps) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${TONE_CLASSES[tone]}`}
    >
      <span
        aria-hidden
        className={`h-2 w-2 shrink-0 rounded-full ${DOT_CLASSES[tone]}`}
      />
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="font-medium">{label}</span>
        {detail && (
          <span className="truncate opacity-80" title={detail}>
            {detail}
          </span>
        )}
      </div>
      {meta && <span className="shrink-0 text-xs opacity-70">{meta}</span>}
    </div>
  );
}

type CompletedCardProps = {
  url: string;
  format: string | null;
  size: number | null;
};

function CompletedCard({ url, format, size }: CompletedCardProps) {
  const meta = [
    format ? format.toUpperCase() : null,
    size != null ? formatBytes(size) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-2 text-sm ${TONE_CLASSES.completed}`}
    >
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="block shrink-0 overflow-hidden rounded-md border border-status-completed/20 bg-background"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="Optimized preview"
          className="h-14 w-14 object-cover"
        />
      </a>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium">Completed</span>
        {meta && <span className="text-xs opacity-70">{meta}</span>}
      </div>
      <a
        href={url}
        download
        className="inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-status-completed px-3 text-xs font-medium text-background transition-opacity hover:opacity-90"
      >
        Download
      </a>
    </div>
  );
}
