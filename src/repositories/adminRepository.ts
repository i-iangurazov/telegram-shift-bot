import { prisma } from "../db/prisma";

export interface AdminRepository {
  isAdminUserId(userId: string): Promise<boolean>;
  countAdmins(): Promise<number>;
  addAdminUserId(userId: string): Promise<void>;
  getAdminUserIds(): Promise<string[]>;
}

export class PrismaAdminRepository implements AdminRepository {
  async isAdminUserId(userId: string): Promise<boolean> {
    const admin = await prisma.admin.findUnique({
      where: { telegramUserId: userId },
      select: { id: true }
    });

    return Boolean(admin);
  }

  async countAdmins(): Promise<number> {
    return prisma.admin.count();
  }

  async addAdminUserId(userId: string): Promise<void> {
    await prisma.admin.upsert({
      where: { telegramUserId: userId },
      create: { telegramUserId: userId },
      update: {}
    });
  }

  async getAdminUserIds(): Promise<string[]> {
    const admins = await prisma.admin.findMany({
      select: { telegramUserId: true }
    });

    return admins.map((admin) => admin.telegramUserId);
  }
}
