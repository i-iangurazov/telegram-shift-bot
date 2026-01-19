import { Context, MiddlewareFn } from "telegraf";
import { AdminService } from "../../services/adminService";
import { messages } from "../messages";

export const adminGuard = (adminService: AdminService): MiddlewareFn<Context> => {
  return async (ctx, next) => {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    if (!chatId || !userId) {
      return;
    }

    const allowed = await adminService.isAdmin(String(userId));
    if (!allowed) {
      await ctx.reply(messages.noAccess);
      return;
    }

    return next();
  };
};
