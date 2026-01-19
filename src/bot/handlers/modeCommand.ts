import { Telegraf } from "telegraf";
import { UserMode } from "@prisma/client";
import { RoleService } from "../../services/roleService";
import { messages } from "../messages";
import { modeInlineKeyboard } from "../keyboards/roleKeyboards";

export const registerModeCommand = (bot: Telegraf, roleService: RoleService): void => {
  const setMode = async (userId: string, mode: UserMode, reply: (text: string) => Promise<unknown>): Promise<void> => {
    const role = await roleService.resolveRole(userId);
    if (!role.isBoth) {
      await reply(messages.modeUnavailable);
      return;
    }

    await roleService.setMode(userId, mode);
    if (mode === UserMode.ADMIN) {
      await reply(messages.modeSetAdmin);
      return;
    }

    await reply(messages.modeSetEmployee);
  };

  bot.command("mode", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) {
      return;
    }

    const role = await roleService.resolveRole(String(userId));
    if (!role.isBoth) {
      await ctx.reply(messages.modeUnavailable);
      return;
    }

    await ctx.reply(messages.modePrompt, modeInlineKeyboard);
  });

  bot.action(/^mode:(ADMIN|EMPLOYEE)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from?.id;
    if (!userId) {
      return;
    }

    const data = "data" in ctx.callbackQuery ? ctx.callbackQuery.data : "";
    const modeValue = data.split(":")[1];
    if (modeValue !== "ADMIN" && modeValue !== "EMPLOYEE") {
      return;
    }

    await setMode(String(userId), modeValue === "ADMIN" ? UserMode.ADMIN : UserMode.EMPLOYEE, (text) => ctx.reply(text));
  });

  bot.hears("Режим: Админ", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) {
      return;
    }

    await setMode(String(userId), UserMode.ADMIN, (text) => ctx.reply(text));
  });

  bot.hears("Режим: Сотрудник", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) {
      return;
    }

    await setMode(String(userId), UserMode.EMPLOYEE, (text) => ctx.reply(text));
  });
};
