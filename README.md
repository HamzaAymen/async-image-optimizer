# Async Image Optimizer

A production-style image optimization pipeline built as a **Bun + TypeScript monorepo**. Users upload an image, the system optimizes it asynchronously, and progress streams back over SSE in real time.

The frontend is intentionally thin. **The interesting part is the backend** — direct-to-R2 uploads via presigned URLs, a BullMQ-powered worker pool with Sharp, the transactional outbox pattern for durable job events, Redis-backed rate limiting, scheduled maintenance jobs, and live job status fan-out over Server-Sent Events.

---

## Why this exists

This project is a portfolio piece. It's not built to be the simplest image resizer — it's built to be a realistic, well-instrumented async backend. Every moving part is something you'd actually find in production:

- A request boundary that **doesn't block on heavy work**.
- A **decoupled worker** that can scale horizontally and crash safely.
- **Durable state** (Postgres) and **fast queues** (Redis) — each used for what it's good at.
- **Idempotent retries**, exponential backoff, terminal failure handling.
- **Real-time client updates** without polling.
- A **transactional outbox** so we never lose a state transition, even if the broker is down.
- **Rate limiting** and **scheduled cleanup** — because "build it and forget it" only works when you build the boring parts too.

---

## Architecture

```
                    ┌──────────────┐                 ┌──────────────┐
                    │              │   1. presign    │              │
                    │   Next.js    │ ──────────────▶ │     API      │
                    │   (web)      │                 │  (Express)   │
                    │              │ ◀────────────── │              │
                    └──────┬───────┘   presigned URL └──────┬───────┘
                           │                                 │
                  2. PUT   │                                 │ 4. enqueue
                  direct   │                                 │
                           ▼                                 ▼
                    ┌──────────────┐                 ┌──────────────┐
                    │              │                 │              │
                    │ Cloudflare   │                 │   Redis      │
                    │     R2       │ ◀── 6. write ── │  (BullMQ)    │
                    │              │      output     │              │
                    └──────────────┘                 └──────┬───────┘
                                                            │
                                                            │ 5. consume
                                                            ▼
                    ┌──────────────┐                 ┌──────────────┐
                    │              │                 │              │
                    │  Postgres    │ ◀── 7. update ──│   Worker     │
                    │  (Prisma)    │     job state   │   (Sharp)    │
                    │              │     + event     │              │
                    └──────────────┘                 └──────────────┘
                           ▲                                 │
                           │ 3. create Job +                 │
                           │    Event (outbox)               │
                           │                                 │
                           │      ┌──────────────┐           │
                           └──────┤              │           │
                                  │   API SSE    │ ◀─────────┘
                                  │  /stream     │   QueueEvents
              ◀──────────────────── (better-sse) │   (Redis pub/sub
                 8. live status   │              │    → EventEmitter
                                  └──────────────┘    → SSE session)
```

The flow:

1. Browser asks the API for a **presigned R2 PUT URL**.
2. Browser uploads the file **directly to R2** — bytes never touch our API.
3. Browser tells the API "I uploaded `key`, here are the operations." API persists a `Job` row and an outbox `Event` row.
4. API enqueues a BullMQ job keyed by the DB job id.
5. The worker pulls from Redis, fetches the source from R2.
6. Sharp runs the pipeline (resize / webp / minify) and writes the output back to R2.
7. The worker updates Postgres (status + outbox event).
8. The browser, subscribed to `GET /jobs/:id/stream`, gets a real-time SSE push for every state change — no polling.

---

## Repository layout

```
async-image-optimizer/
├── apps/
│   ├── web/        Next.js 16 + React 19 client (upload UI, SSE consumer)
│   ├── api/        Express 5 HTTP API (presign, jobs, SSE)
│   └── worker/     BullMQ worker pool + Sharp pipeline + maintenance scheduler
├── packages/
│   ├── db/         Prisma schema + generated client (Postgres via Neon adapter)
│   └── queue/      Shared queue names + payload types (single source of truth)
├── docker-compose.yml   Local Redis
└── package.json         Bun workspaces
```

Workspaces are wired via Bun: `db` and `queue` are imported as `workspace:*` in `api` and `worker`, so type changes propagate instantly with no build step.

---

## Tech stack

| Layer         | Choice                                                                                 | Why                                                                 |
| ------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Runtime       | **Bun**                                                                                | Fast install, native TS, hot reload via `--hot`                     |
| Language      | **TypeScript** (strict)                                                                | End-to-end type safety, including queue payloads                    |
| HTTP          | **Express 5**                                                                          | Boring, battle-tested                                               |
| Validation    | **Zod**                                                                                | Runtime validation + inferred TS types at API and worker boundaries |
| Queue         | **BullMQ** on Redis                                                                    | Retries, exponential backoff, scheduling, QueueEvents pub/sub       |
| Database      | **Postgres** + **Prisma** (Neon adapter)                                               | Strong consistency for job state, JSON columns for `operations`     |
| Storage       | **Cloudflare R2** (S3 SDK)                                                             | Direct browser uploads via presigned URLs                           |
| Image         | **Sharp** (libvips)                                                                    | Industry-standard image pipeline (mozjpeg, webp, AVIF)              |
| Real-time     | **better-sse** + Node `EventEmitter`                                                   | One-way server push, no WebSocket overhead                          |
| Rate limiting | **express-rate-limit** + **rate-limit-redis**                                          | Distributed limit across API instances                              |
| Frontend      | **Next.js 16**, **React 19**, **TanStack Query**, **react-hook-form**, **Tailwind v4** | Modern, minimal, focused on the form + status UI                    |

---

## Backend deep dive

### 1. Direct-to-R2 uploads (no API as a middleman for bytes)

```
POST /uploads/presign  →  { url, key, bucket, expiresIn, method: "PUT" }
```

The API never receives the image bytes. It signs a 5-minute PUT URL, the browser uploads straight to R2, then calls `POST /jobs` with the resulting object key. This keeps the API stateless, cheap, and impossible to OOM with a large upload.

Allowed content types are validated server-side from a fixed allowlist (`apps/api/src/constants.ts`) — both at presign time and at job creation time.

### 2. Job submission with the outbox pattern

When a job is submitted, two things must be true:

1. The job row exists in Postgres.
2. The job is enqueued to Redis.

If either side disappears, the system breaks. The classic answer is the **transactional outbox**: write the intent to your durable store, then publish from there.

In this repo, every state transition writes both a `Job` update **and** an `Event` row in the same Prisma client:

```ts
// apps/api/src/routes/jobs.ts
const job = await prisma.job.create({ data: { ... } });
await prisma.event.create({ data: { jobId: job.id, type: JOB_CREATED, payload: {} } });

await imageQueue.add(IMAGE_JOB_NAME, { jobId: job.id }, {
  jobId: job.id,                                 // BullMQ id == DB id (idempotent)
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: { age: 3600 },
  removeOnFail: { age: 86400 },
});

await prisma.job.update({ where: { id: job.id }, data: { status: QUEUED } });
await prisma.event.create({ data: { jobId: job.id, type: JOB_QUEUED, payload: {} } });
```

The `Event` table is the durable log of "what happened" — independent of Redis. If the queue is wiped, we still have the source of truth. The same pattern is used end-to-end: `JOB_CREATED → JOB_QUEUED → JOB_RUNNING → JOB_COMPLETED | JOB_FAILED | JOB_CANCELLED`.

The BullMQ job id is set to the DB job id, which means a duplicate submission attempt is **idempotent** at the queue level.

### 3. Worker pipeline

`apps/worker/src/processor.ts` is the BullMQ processor. Each job:

1. Marks the DB job as `RUNNING`, increments `attempts`.
2. Validates payload with Zod (defense in depth — never trust queue contents).
3. Pulls the source object from R2.
4. Runs the Sharp pipeline (`apps/worker/src/pipeline.ts`).
5. Writes the output to R2.
6. Updates the DB to `COMPLETED` and writes an `Event`.

The pipeline rules:

- **Width or height set?** Resize with `fit: inside` (preserves aspect ratio).
- **WebP checkbox set?** Encode as WebP at quality 80.
- **Neither?** Encode in the source format with mozjpeg / max-compression PNG / webp re-encode, plus a default 1920px max dimension cap (`withoutEnlargement: true`) — i.e., minify-only mode.

EXIF rotation is auto-applied (`.rotate()`) before any resize.

The worker auto-scales concurrency via `WORKER_CONCURRENCY`, defaulting to `navigator.hardwareConcurrency`.

### 4. Failure handling

- **3 attempts** with exponential backoff (5s base).
- On final failure, the worker writes `JobStatus.FAILED` plus a truncated stack trace to Postgres, and emits `JOB_FAILED` to the outbox.
- BullMQ's `removeOnComplete` / `removeOnFail` keep Redis tidy automatically.
- The DB write is wrapped in its own try/catch so a Postgres blip during failure handling doesn't crash the worker.
- **Graceful shutdown**: `SIGINT` / `SIGTERM` close the worker, the maintenance worker, the maintenance queue, and the Redis connection in order. In-flight jobs finish before exit.

### 5. Real-time status via SSE

`GET /jobs/:id/stream` is a Server-Sent Events endpoint. The flow:

```
Worker → Redis pub/sub (BullMQ QueueEvents)
       → API EventEmitter (jobBus)
       → SSE session.push(...)  →  Browser
```

`apps/api/src/lib/queue-events.ts` subscribes once per API process to BullMQ's `QueueEvents` (active / completed / failed / progress). It fans out into a process-local `EventEmitter` keyed by job id. Each SSE handler subscribes to its job id, re-reads the DB, and pushes a fresh snapshot to the client. Listener cleanup on disconnect prevents leaks.

The connection sends keep-alives every 25s and disables proxy buffering with `X-Accel-Buffering: no` so it works behind nginx / Cloudflare.

The browser side (`apps/web/src/lib/use-job-status.ts`) is a tiny `EventSource` hook that closes itself on terminal status — zero polling, zero reconnect logic to maintain.

### 6. Rate limiting

`POST /jobs` is rate-limited to **5 submissions per 30 minutes per IP**, backed by Redis so the limit is shared across API instances:

```ts
// apps/api/src/lib/rate-limit.ts
export const submitJobLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  limit: 5,
  store: new RedisStore({ sendCommand, prefix: "rl:submit-job:" }),
  standardHeaders: "draft-7",
});
```

Standard `RateLimit-*` headers are emitted (RFC draft-7) so clients can self-throttle.

### 7. Scheduled maintenance

The worker registers a BullMQ scheduler at startup that runs **every minute**:

```ts
// apps/worker/src/lib/maintenance-queue.ts
maintenanceQueue.upsertJobScheduler(
  "cleanup-events-every-minute",
  { pattern: "*/1 * * * *" },
  { name: "cleanup-events", ... },
);
```

The handler (`apps/worker/src/maintenance.ts`) deletes `Event` rows for jobs that hit a terminal state more than 5 minutes ago. The 5-minute grace window guarantees any in-flight SSE consumer or async event publisher has finished reading. This keeps the outbox table bounded without losing the durability guarantee during the window when it matters.

`upsertJobScheduler` is idempotent — restarting the worker doesn't create duplicate schedulers.

### 8. Data model

```prisma
model Job {
  id           String    @id @default(cuid())
  status       JobStatus @default(PENDING)
  sourceKey    String
  sourceBucket String
  sourceType   String
  sourceSize   Int?
  outputKey    String?
  outputSize   Int?
  outputFormat String?
  operations   Json?     // { width?, height?, webp }
  error        String?
  attempts     Int       @default(0)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  @@index([status, createdAt])
}

model Event {
  id          String    @id @default(cuid())
  jobId       String
  type        EventType
  payload     Json
  createdAt   DateTime  @default(now())
  publishedAt DateTime?

  @@index([publishedAt, createdAt])
  @@index([jobId])
}
```

`@@index([status, createdAt])` covers operational queries ("show me running jobs", "show me failures from the last hour"). `@@index([publishedAt, createdAt])` is the outbox dispatcher index — `publishedAt IS NULL ORDER BY createdAt` is the natural query for any future relay process.

The Prisma client uses the **Neon serverless adapter** (`@prisma/adapter-neon`), so the same code runs against Neon Postgres in production and a local Postgres in dev.

---

## API reference

### `POST /uploads/presign`

```json
// request
{ "contentType": "image/jpeg" }

// response
{ "url": "https://...", "key": "uploads/abc...", "bucket": "...", "expiresIn": 300, "method": "PUT" }
```

### `POST /jobs` _(rate-limited: 5 / 30 min / IP)_

```json
// request
{
  "sourceKey": "uploads/abc...",
  "sourceBucket": "your-bucket",
  "sourceType": "image/jpeg",
  "sourceSize": 1234567,
  "operations": { "width": 800, "webp": true }
}

// response (201)
{ "id": "ckl...", "status": "QUEUED", ... }
```

### `GET /jobs/:id`

Returns the current job snapshot, including a presigned download URL when `status === COMPLETED`.

### `GET /jobs/:id/stream`

Server-Sent Events. Emits:

- `event: status` — `JobSnapshot` JSON, sent on every state change.
- `event: done` — `{ status }` once a terminal state is reached. The client should close the connection.

---

## Running locally

### Prerequisites

- **Bun** ≥ 1.x
- **Docker** (for Redis)
- **Postgres** — Neon, Supabase, or local. You need a `DATABASE_URL`.
- **Cloudflare R2** bucket + access keys.

### 1. Install

```bash
bun install
```

### 2. Start Redis

```bash
docker compose up -d
```

### 3. Configure env

Create `.env` files in each app:

**`apps/api/.env`**

```
PORT=3001
REDIS_URL=redis://localhost:6379
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=...
```

**`apps/worker/.env`**

```
REDIS_URL=redis://localhost:6379
WORKER_CONCURRENCY=4
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=...
```

**`packages/db/.env`**

```
DATABASE_URL=postgres://...
```

**`apps/web/.env`**

```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

> Don't forget to configure CORS on your R2 bucket to allow `PUT` from `http://localhost:3000`.

### 4. Migrate the database

```bash
cd packages/db
bun prisma migrate dev
```

### 5. Run everything

```bash
# from the repo root
bun run dev          # runs web + api + worker concurrently

# or individually
bun run dev:web      # http://localhost:3000
bun run dev:api      # http://localhost:3001
bun run dev:worker
```

Open `http://localhost:3000`, drop an image in, watch the status update in real time.

---

## Design decisions worth calling out

- **Bun workspaces over a build step.** Shared packages (`db`, `queue`) export TS directly. Bun resolves them. No `tsc --build`, no path aliases that drift, no compiled `dist/` to keep in sync.
- **One source of truth per concern.** Postgres owns _state_. Redis owns _work_. R2 owns _bytes_. Nothing is duplicated except by intent (the outbox).
- **The API is stateless.** It writes to Postgres, signs URLs, enqueues work, and proxies SSE. It can scale horizontally without coordination. SSE fan-out works because every API instance subscribes to the same Redis pub/sub channel via `QueueEvents`.
- **Boundaries are validated.** Zod at the HTTP layer, Zod again at the worker (queue payload + persisted operations). Belt and braces — the queue is an internal trust boundary, not a free pass.
- **Idempotency by construction.** BullMQ job id = DB job id. Re-submitting the same logical job is a no-op at the queue layer.
- **Bounded retention.** The outbox table is cleaned on a schedule. The queue uses `removeOnComplete` / `removeOnFail`. Without these, every async system eventually drowns in its own history.
- **No premature abstractions.** No event bus framework, no DI container, no "domain layer" — each file has one job and one place to look for it.

---

## What's intentionally not here

This is a portfolio project, so some things were left out on purpose to keep the focus tight:

- **Auth** — anyone can submit a job. In production this would sit behind session auth or signed client tokens.
- **Multi-tenancy** — single global rate limit and queue.
- **An outbox dispatcher** — the `Event.publishedAt` column exists and is indexed, but the worker writes events synchronously rather than relaying through a separate publisher. The structure is in place to add one (e.g., to fan out to a webhook system) without a schema change.
- **Tests** — the focus was the architecture, not test coverage.

---
