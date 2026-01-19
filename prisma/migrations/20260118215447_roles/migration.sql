-- CreateEnum
CREATE TYPE "EmployeeRoleOverride" AS ENUM ('DEFAULT', 'FORCE_EMPLOYEE', 'FORCE_ADMIN', 'BOTH');

-- CreateEnum
CREATE TYPE "UserMode" AS ENUM ('ADMIN', 'EMPLOYEE');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "roleOverride" "EmployeeRoleOverride" NOT NULL DEFAULT 'DEFAULT';

-- CreateTable
CREATE TABLE "UserSession" (
    "id" SERIAL NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "mode" "UserMode" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_telegramUserId_key" ON "UserSession"("telegramUserId");
