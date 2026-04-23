import express, { type Request, type Response } from "express";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(express.json());

app.get("/", (_req: Request, res: Response) => {
  res.json({ service: "api", status: "ok" });
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.listen(port, () => {
  console.log(`api listening on http://localhost:${port}`);
});
