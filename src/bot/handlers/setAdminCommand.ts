import { Telegraf } from "telegraf";
import { AdminService } from "../../services/adminService";
import { messages } from "../messages";

export const registerSetAdminCommand = (
  bot: Telegraf,
  adminService: AdminService
): void => {
  bot.command("set_admin", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) {
      return;
    }

    const allowed = await adminService.canAssignAdmin(String(userId));
    if (!allowed) {
      await ctx.reply(messages.noAccess);
      return;
    }

    await adminService.addAdmin(String(userId));
    await ctx.reply(messages.setAdminSuccess);
  });
};
