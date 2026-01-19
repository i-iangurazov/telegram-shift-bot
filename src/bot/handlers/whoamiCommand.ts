import { Telegraf } from "telegraf";

export const registerWhoamiCommand = (bot: Telegraf): void => {
  bot.command("whoami", async (ctx) => {
    const chat = ctx.chat;
    const from = ctx.from;

    if (!chat || !from) {
      return;
    }

    const username = from.username ? `@${from.username}` : "—";
    const lines = [
      `Тип чата: ${chat.type}`,
      `Chat ID: ${chat.id}`,
      `Ваш User ID: ${from.id}`,
      `Username: ${username}`,
      `Подсказка: TELEGRAM_BOSS_CHAT_ID = ${chat.id}, ADMIN_USER_IDS += ${from.id}`
    ];

    await ctx.reply(lines.join("\n"));
  });
};
