-- CreateEnum
CREATE TYPE "PendingActionType" AS ENUM ('START', 'END');

-- CreateEnum
CREATE TYPE "PendingActionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED');

-- AlterTable
ALTER TABLE "Shift" ALTER COLUMN "startPhotoFileId" DROP NOT NULL;
ALTER TABLE "Shift" ADD COLUMN "employeeChatId" TEXT;
ALTER TABLE "Shift" ADD COLUMN "photosPurgedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PendingAction" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "actionType" "PendingActionType" NOT NULL,
    "photoFileId" TEXT NOT NULL,
    "photoMessageId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "PendingActionStatus" NOT NULL DEFAULT 'PENDING',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingAction_chatId_photoMessageId_key" ON "PendingAction"("chatId", "photoMessageId");

-- CreateIndex
CREATE INDEX "PendingAction_telegramUserId_status_idx" ON "PendingAction"("telegramUserId", "status");

-- CreateIndex
CREATE INDEX "PendingAction_expiresAt_idx" ON "PendingAction"("expiresAt");

-- CreateIndex
CREATE INDEX "Shift_employeeId_idx" ON "Shift"("employeeId");

-- AddForeignKey
ALTER TABLE "PendingAction" ADD CONSTRAINT "PendingAction_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
