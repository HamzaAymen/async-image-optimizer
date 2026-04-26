import { QueueEvents } from "bullmq";
import { EventEmitter } from "node:events";
import { IMAGE_QUEUE_NAME } from "queue";
import { redis } from "./redis";

export const jobBus = new EventEmitter();
jobBus.setMaxListeners(0);

export const queueEvents = new QueueEvents(IMAGE_QUEUE_NAME, {
  connection: redis.duplicate(),
});

queueEvents.on("active", ({ jobId }) => {
  jobBus.emit(jobId);
});
queueEvents.on("completed", ({ jobId }) => {
  jobBus.emit(jobId);
});
queueEvents.on("failed", ({ jobId }) => {
  jobBus.emit(jobId);
});
queueEvents.on("progress", ({ jobId }) => {
  jobBus.emit(jobId);
});

queueEvents.on("error", (err) => {
  console.error("QueueEvents error", err);
});
