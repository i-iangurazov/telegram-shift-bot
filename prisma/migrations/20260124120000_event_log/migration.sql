-- CreateTable
CREATE TABLE IF NOT EXISTS "EventLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "updateId" INTEGER,
    "chatId" TEXT,
    "fromId" TEXT,
    "messageId" INTEGER,
    "updateType" TEXT,
    "meta" JSONB,
    "errorName" TEXT,
    "errorMsg" TEXT,
    "errorStack" TEXT,
    "fingerprint" TEXT,

    CONSTRAINT "EventLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EventLog_createdAt_idx" ON "EventLog"("createdAt");
CREATE INDEX IF NOT EXISTS "EventLog_kind_createdAt_idx" ON "EventLog"("kind", "createdAt");
CREATE INDEX IF NOT EXISTS "EventLog_fromId_createdAt_idx" ON "EventLog"("fromId", "createdAt");
CREATE INDEX IF NOT EXISTS "EventLog_chatId_createdAt_idx" ON "EventLog"("chatId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "EventLog_fingerprint_key" ON "EventLog"("fingerprint");
