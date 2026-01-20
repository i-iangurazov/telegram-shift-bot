-- AlterTable
ALTER TABLE "UserSession" ADD COLUMN IF NOT EXISTS "fullNameRequestedAt" TIMESTAMP(3);
