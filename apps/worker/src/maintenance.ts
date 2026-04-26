import { JobStatus, prisma } from "db";

const TERMINAL_STATUSES = [
  JobStatus.COMPLETED,
  JobStatus.FAILED,
  JobStatus.CANCELLED,
];
const GRACE_MS = 5 * 60_000;

export async function runEventCleanup() {
  const cutoff = new Date(Date.now() - GRACE_MS);

  const terminalJobs = await prisma.job.findMany({
    where: { status: { in: TERMINAL_STATUSES }, updatedAt: { lt: cutoff } },
    select: { id: true },
  });
  if (terminalJobs.length === 0) {
    return { deleted: 0, jobs: 0 };
  }

  const { count } = await prisma.event.deleteMany({
    where: { jobId: { in: terminalJobs.map((j) => j.id) } },
  });
  console.log(
    `[maintenance] cleanup-events: removed ${count} rows across ${terminalJobs.length} jobs`,
  );
  return { deleted: count, jobs: terminalJobs.length };
}
