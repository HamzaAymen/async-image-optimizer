-- DropForeignKey
ALTER TABLE "Event" DROP CONSTRAINT "Event_jobId_fkey";

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "operations" JSONB;
