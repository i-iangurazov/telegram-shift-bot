import { UserMode } from "@prisma/client";
import { prisma } from "../db/prisma";

export interface UserSessionRepository {
  getSession(userId: string): Promise<{ telegramUserId: string; mode: UserMode } | null>;
  setSession(userId: string, mode: UserMode): Promise<void>;
}

export class PrismaUserSessionRepository implements UserSessionRepository {
  async getSession(userId: string): Promise<{ telegramUserId: string; mode: UserMode } | null> {
    return prisma.userSession.findUnique({
      where: { telegramUserId: userId },
      select: { telegramUserId: true, mode: true }
    });
  }

  async setSession(userId: string, mode: UserMode): Promise<void> {
    await prisma.userSession.upsert({
      where: { telegramUserId: userId },
      create: { telegramUserId: userId, mode },
      update: { mode }
    });
  }
}
