"use client";

import { useEffect, useState } from "react";

export type JobStatus =
  | "PENDING"
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type JobSnapshot = {
  id: string;
  status: JobStatus;
  outputKey: string | null;
  outputFormat: string | null;
  outputSize: number | null;
  outputUrl: string | null;
  error: string | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
};

const TERMINAL = new Set<JobStatus>(["COMPLETED", "FAILED", "CANCELLED"]);

export function useJobStatus(jobId: string | null) {
  const [snapshot, setSnapshot] = useState<JobSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) {
      setSnapshot(null);
      setError(null);
      return;
    }

    setSnapshot(null);
    setError(null);

    const base = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
    const url = `${base}/jobs/${jobId}/stream`;
    const es = new EventSource(url);

    es.addEventListener("status", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as JobSnapshot;
        setSnapshot(data);
        if (TERMINAL.has(data.status)) {
          es.close();
        }
      } catch {
        // ignore malformed payloads
      }
    });

    es.addEventListener("done", () => {
      es.close();
    });

    es.addEventListener("error", () => {
      // EventSource auto-reconnects on transient errors; only surface if closed.
      if (es.readyState === EventSource.CLOSED) {
        setError("Connection closed");
      }
    });

    return () => {
      es.close();
    };
  }, [jobId]);

  return { snapshot, error };
}
