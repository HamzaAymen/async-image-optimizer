FROM oven/bun:1-debian AS builder
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/queue/package.json packages/queue/

RUN bun install --frozen-lockfile

COPY packages/queue packages/queue
COPY packages/db packages/db
COPY apps/api apps/api
COPY tsconfig.json ./

RUN cd packages/db && DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" bunx prisma generate

FROM oven/bun:1-debian AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app /app

EXPOSE 3001
CMD ["bun", "run", "apps/api/src/index.ts"]
