-- CreateEnum
CREATE TYPE "ClosedReason" AS ENUM ('USER_PHOTO', 'AUTO_TIMEOUT');

-- CreateEnum
CREATE TYPE "ViolationType" AS ENUM ('NOT_CLOSED_IN_TIME');

-- CreateTable
CREATE TABLE "Employee" (
    "id" SERIAL NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "startPhotoFileId" TEXT NOT NULL,
    "endPhotoFileId" TEXT,
    "startMessageId" INTEGER NOT NULL,
    "startChatId" TEXT NOT NULL,
    "endMessageId" INTEGER,
    "endChatId" TEXT,
    "closedReason" "ClosedReason",
    "autoClosedAt" TIMESTAMP(3),
    "alertedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftViolation" (
    "id" SERIAL NOT NULL,
    "shiftId" INTEGER NOT NULL,
    "type" "ViolationType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftViolation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admin" (
    "id" SERIAL NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_telegramUserId_key" ON "Employee"("telegramUserId");

-- CreateIndex
CREATE INDEX "Shift_employeeId_endTime_idx" ON "Shift"("employeeId", "endTime");

-- CreateIndex
CREATE INDEX "Shift_startTime_idx" ON "Shift"("startTime");

-- CreateIndex
CREATE UNIQUE INDEX "Shift_startChatId_startMessageId_key" ON "Shift"("startChatId", "startMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "Shift_endChatId_endMessageId_key" ON "Shift"("endChatId", "endMessageId");

-- CreateIndex
CREATE INDEX "ShiftViolation_type_createdAt_idx" ON "ShiftViolation"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftViolation_shiftId_type_key" ON "ShiftViolation"("shiftId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_telegramUserId_key" ON "Admin"("telegramUserId");

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftViolation" ADD CONSTRAINT "ShiftViolation_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
