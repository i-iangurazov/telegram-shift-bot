-- CreateTable
CREATE TABLE IF NOT EXISTS "TelegramUpdateQueue" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateId" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramUpdateQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TelegramUpdateQueue_updateId_key" ON "TelegramUpdateQueue"("updateId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TelegramUpdateQueue_status_nextRunAt_createdAt_idx" ON "TelegramUpdateQueue"("status", "nextRunAt", "createdAt");
