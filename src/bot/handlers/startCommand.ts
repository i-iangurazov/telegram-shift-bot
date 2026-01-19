import { Telegraf } from "telegraf";
import { RoleService } from "../../services/roleService";
import { messages } from "../messages";
import { adminKeyboard, employeeKeyboard, roleSwitchKeyboard } from "../keyboards/roleKeyboards";

export const registerStartCommand = (bot: Telegraf, roleService: RoleService): void => {
  bot.start(async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) {
      return;
    }

    const role = await roleService.resolveRole(String(userId));

    if (role.isBoth) {
      await ctx.reply(messages.startBoth, roleSwitchKeyboard);
      return;
    }

    if (role.mode === "ADMIN") {
      await ctx.reply(messages.startAdmin, adminKeyboard);
      return;
    }

    await ctx.reply(messages.startEmployee, employeeKeyboard);
  });
};
