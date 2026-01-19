import { Telegraf } from "telegraf";
import { RoleService } from "../../services/roleService";
import { messages } from "../messages";

export const registerHelpCommand = (bot: Telegraf, roleService: RoleService): void => {
  const handleHelp = async (userId: string, reply: (text: string) => Promise<unknown>): Promise<void> => {
    const role = await roleService.resolveRole(userId);
    if (role.isBoth) {
      const modeLabel = role.mode === "ADMIN" ? "Админ" : "Сотрудник";
      await reply(`${messages.helpBoth}\nТекущий режим: ${modeLabel}.`);
      return;
    }

    if (role.mode === "ADMIN") {
      await reply(messages.helpAdmin);
      return;
    }

    await reply(messages.helpEmployee);
  };

  bot.command("help", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) {
      return;
    }

    await handleHelp(String(userId), (text) => ctx.reply(text));
  });

  bot.hears("Помощь", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) {
      return;
    }

    await handleHelp(String(userId), (text) => ctx.reply(text));
  });
};
