import { config } from "./config";
import { shutdown, worker } from "./queue";

console.log(
  `[worker] started (concurrency=${config.concurrency}, queue=image-jobs)`,
);
void worker;

let shuttingDown = false;
async function handleSignal(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] ${signal} received, shutting down`);
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
