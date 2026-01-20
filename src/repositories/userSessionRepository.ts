import { UserMode } from "@prisma/client";
import { prisma } from "../db/prisma";

export interface UserSessionRecord {
  telegramUserId: string;
  mode: UserMode;
  nameRequestedAt?: Date | null;
}

export interface UserSessionRepository {
  getSession(userId: string): Promise<UserSessionRecord | null>;
  setSession(userId: string, mode: UserMode): Promise<void>;
  setNameRequestedAt(userId: string, requestedAt?: Date): Promise<void>;
  clearNameRequestedAt(userId: string): Promise<void>;
}

export class PrismaUserSessionRepository implements UserSessionRepository {
  async getSession(userId: string): Promise<UserSessionRecord | null> {
    return prisma.userSession.findUnique({
      where: { telegramUserId: userId },
      select: { telegramUserId: true, mode: true, nameRequestedAt: true }
    });
  }

  async setSession(userId: string, mode: UserMode): Promise<void> {
    await prisma.userSession.upsert({
      where: { telegramUserId: userId },
      create: { telegramUserId: userId, mode },
      update: { mode }
    });
  }

  async setNameRequestedAt(userId: string, requestedAt: Date = new Date()): Promise<void> {
    await prisma.userSession.upsert({
      where: { telegramUserId: userId },
      create: { telegramUserId: userId, mode: UserMode.EMPLOYEE, nameRequestedAt: requestedAt },
      update: { nameRequestedAt: requestedAt }
    });
  }

  async clearNameRequestedAt(userId: string): Promise<void> {
    await prisma.userSession.updateMany({
      where: { telegramUserId: userId },
      data: { nameRequestedAt: null }
    });
  }
}
