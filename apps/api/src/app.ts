import cors from "cors";
import { prisma } from "db";
import express, {
  type ErrorRequestHandler,
  type Request,
  type Response,
} from "express";
import { config } from "./config";
import { redis } from "./lib/redis";
import "./lib/queue-events";
import { jobsRouter } from "./routes/jobs";
import { uploadsRouter } from "./routes/uploads";

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};

export function createApp() {
  const app = express();

  app.use(cors({ origin: config.webOrigin }));
  app.use(express.json());

  app.use("/uploads", uploadsRouter);
  app.use("/jobs", jobsRouter);

  app.get("/health", async (_req: Request, res: Response) => {
    try {
      await Promise.all([redis.ping(), prisma.$queryRaw`SELECT 1`]);
      res.status(200).json({ ok: true });
    } catch (err) {
      res.status(503).json({ ok: false, error: String(err) });
    }
  });

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use(errorHandler);

  return app;
}
