import { config } from "./config";
import { runEventCleanup } from "./maintenance";
import { shutdown, worker } from "./queue";

const CLEANUP_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;

console.log(
  `[worker] started (concurrency=${config.concurrency}, queue=image-jobs)`,
);
void worker;

runEventCleanup().catch((err) =>
  console.error("[maintenance] startup cleanup failed:", err),
);
const cleanupInterval = setInterval(() => {
  runEventCleanup().catch((err) =>
    console.error("[maintenance] cleanup failed:", err),
  );
}, CLEANUP_INTERVAL_MS);
console.log("[worker] event cleanup scheduled (every 3 days)");

let shuttingDown = false;
async function handleSignal(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] ${signal} received, shutting down`);
  clearInterval(cleanupInterval);
  try {
    await shutdown();
    process.exit(0);
  } catch (err) {
    console.error("[worker] error during shutdown:", err);
    process.exit(1);
  }
}

process.on("SIGINT", () => void handleSignal("SIGINT"));
process.on("SIGTERM", () => void handleSignal("SIGTERM"));
