import cors from "cors";
import express, {
  type ErrorRequestHandler,
  type Request,
  type Response,
} from "express";
import "./lib/queue-events";
import { jobsRouter } from "./routes/jobs";
import { uploadsRouter } from "./routes/uploads";

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};

export function createApp() {
  const app = express();

  app.use(cors({ origin: "http://localhost:3000" }));
  app.use(express.json());

  app.use("/uploads", uploadsRouter);
  app.use("/jobs", jobsRouter);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use(errorHandler);

  return app;
}
