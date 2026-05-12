import { config } from "./config";
import { runEventCleanup } from "./maintenance";
import { shutdown, worker } from "./queue";
import { closeRelay, runRelay } from "./relay";

const CLEANUP_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;
const RELAY_INTERVAL_MS = 2000;

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

let relayBusy = false;
const relayInterval = setInterval(() => {
  if (relayBusy) return;
  relayBusy = true;
  runRelay()
    .catch((err) => console.error("[relay] tick failed:", err))
    .finally(() => {
      relayBusy = false;
    });
}, RELAY_INTERVAL_MS);
console.log(`[worker] outbox relay scheduled (every ${RELAY_INTERVAL_MS}ms)`);

let shuttingDown = false;
async function handleSignal(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] ${signal} received, shutting down`);
  clearInterval(cleanupInterval);
  clearInterval(relayInterval);
  try {
    await closeRelay();
    await shutdown();
    process.exit(0);
  } catch (err) {
    console.error("[worker] error during shutdown:", err);
    process.exit(1);
  }
}

process.on("SIGINT", () => void handleSignal("SIGINT"));
process.on("SIGTERM", () => void handleSignal("SIGTERM"));
