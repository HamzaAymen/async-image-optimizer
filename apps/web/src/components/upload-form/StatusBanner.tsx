"use client";

type Variant = "error" | "success";

const styles: Record<Variant, string> = {
  error:
    "border-status-failed/20 bg-status-failed-bg text-status-failed",
  success:
    "border-status-completed/20 bg-status-completed-bg text-status-completed",
};

type StatusBannerProps = {
  variant: Variant;
  children: React.ReactNode;
};

export function StatusBanner({ variant, children }: StatusBannerProps) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-sm ${styles[variant]}`}
    >
      {children}
    </div>
  );
}
