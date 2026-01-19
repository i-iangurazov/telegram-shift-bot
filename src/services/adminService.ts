import { env } from "../config/env";
import { AdminRepository } from "../repositories/adminRepository";

export class AdminService {
  constructor(private adminRepo: AdminRepository) {}

  async isAdmin(userId: string): Promise<boolean> {
    if (env.adminUserIds.includes(userId)) {
      return true;
    }
    return this.adminRepo.isAdminUserId(userId);
  }

  async canAssignAdmin(userId: string): Promise<boolean> {
    const existingAdmins = await this.adminRepo.countAdmins();
    const hasAnyAdmins = existingAdmins > 0 || env.adminUserIds.length > 0;
    if (!hasAnyAdmins) {
      return true;
    }
    return this.isAdmin(userId);
  }

  async addAdmin(userId: string): Promise<void> {
    await this.adminRepo.addAdminUserId(userId);
  }

  async getAdminChatIds(): Promise<string[]> {
    const dbAdmins = await this.adminRepo.getAdminUserIds();
    const unique = new Set<string>([env.telegramBossChatId, ...env.adminUserIds, ...dbAdmins]);
    return Array.from(unique);
  }
}
