import { Telegraf } from "telegraf";
import { messages } from "../messages";
import { RoleService } from "../../services/roleService";

export const registerTextHandler = (bot: Telegraf, roleService: RoleService): void => {
  bot.on("message", async (ctx) => {
    const message = ctx.message;
    if (!message) {
      return;
    }

    if ("photo" in message) {
      return;
    }

    if ("text" in message && message.text.startsWith("/")) {
      return;
    }

    if ("text" in message) {
      const knownButtons = [
        "Помощь",
        "Статус",
        "Сотрудники",
        "Отчёт",
        "Режим: Админ",
        "Режим: Сотрудник"
      ];
      if (knownButtons.includes(message.text)) {
        return;
      }
    }

    const userId = ctx.from?.id;
    if (!userId) {
      return;
    }

    const role = await roleService.resolveRole(String(userId));
    if (role.mode === "ADMIN") {
      await ctx.reply(messages.instructionAdmin);
      return;
    }

    await ctx.reply(messages.instructionEmployee);
  });
};
