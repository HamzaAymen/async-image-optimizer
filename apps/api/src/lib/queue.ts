import { Queue } from "bullmq";
import { IMAGE_QUEUE_NAME, type ImageJobPayload } from "queue";
import { redis } from "./redis";

export const imageQueue = new Queue<ImageJobPayload>(IMAGE_QUEUE_NAME, {
  connection: redis,
});
