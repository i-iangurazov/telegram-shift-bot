import { Context, Markup, Telegraf } from "telegraf";
import { AdminService } from "../../services/adminService";
import { adminGuard } from "../middleware/adminGuard";
import { prisma } from "../../db/prisma";
import { env } from "../../config/env";
import { formatDateTime } from "../../utils/time";
import { buildErrorsPeriodKeyboard } from "../keyboards/adminErrorsKeyboards";
import { splitMessage } from "../formatters/reportFormatter";

const MAX_ERRORS = 10;

const PERIODS: Record<string, { label: string; ms: number }> = {
  "1h": { label: "1 час", ms: 60 * 60 * 1000 },
  "6h": { label: "6 часов", ms: 6 * 60 * 60 * 1000 },
  "24h": { label: "24 часа", ms: 24 * 60 * 60 * 1000 },
  "7d": { label: "7 дней", ms: 7 * 24 * 60 * 60 * 1000 }
};

const parsePeriod = (data: string): { label: string; ms: number } | null => {
  const parts = data.split(":");
  const key = parts[2];
  return key && PERIODS[key] ? PERIODS[key] : null;
};

const truncateLine = (value: string | null | undefined, max = 140): string => {
  if (!value) {
    return "—";
  }
  const line = value.split("\n")[0] ?? "";
  if (line.length <= max) {
    return line;
  }
  return `${line.slice(0, Math.max(0, max - 3))}...`;
};

const formatLines = (value: string | null | undefined, maxLines = 20, maxChars = 2000): string => {
  if (!value) {
    return "—";
  }
  const lines = value.split("\n");
  const trimmedLines = lines.slice(0, maxLines);
  let text = trimmedLines.join("\n");
  if (lines.length > maxLines) {
    text += "\n...";
  }
  if (text.length > maxChars) {
    text = `${text.slice(0, Math.max(0, maxChars - 3))}...`;
  }
  return text;
};

const formatMeta = (meta: unknown): string => {
  if (!meta) {
    return "—";
  }
  if (typeof meta === "string") {
    return formatLines(meta, 20, 2000);
  }
  try {
    return formatLines(JSON.stringify(meta, null, 2), 20, 2000);
  } catch {
    return "—";
  }
};

const buildDetailKeyboard = (ids: string[]): ReturnType<typeof Markup.inlineKeyboard> => {
  const rows: Array<ReturnType<typeof Markup.button.callback>[]> = [];
  for (let i = 0; i < ids.length; i += 2) {
    const row: ReturnType<typeof Markup.button.callback>[] = [];
    row.push(Markup.button.callback(`Подробнее ${i + 1}`, `errors:detail:${ids[i]}`));
    if (ids[i + 1]) {
      row.push(Markup.button.callback(`Подробнее ${i + 2}`, `errors:detail:${ids[i + 1]}`));
    }
    rows.push(row);
  }
  return Markup.inlineKeyboard(rows);
};

export const registerAdminErrorsCommand = (bot: Telegraf, adminService: AdminService): void => {
  const guard = adminGuard(adminService);

  const showPeriodSelection = async (ctx: Context): Promise<void> => {
    await ctx.reply("Ошибки: выберите период.", buildErrorsPeriodKeyboard());
  };

  bot.command("errors", guard, async (ctx) => {
    await showPeriodSelection(ctx);
  });

  bot.hears("Ошибки", guard, async (ctx) => {
    await showPeriodSelection(ctx);
  });

  bot.action(/^errors:period:/, guard, async (ctx) => {
    await ctx.answerCbQuery();
    const data = "data" in ctx.callbackQuery ? ctx.callbackQuery.data : "";
    const period = parsePeriod(data);
    if (!period) {
      return;
    }

    const since = new Date(Date.now() - period.ms);
    const logs = await prisma.eventLog.findMany({
      where: {
        level: "error",
        createdAt: { gte: since }
      },
      orderBy: { createdAt: "desc" },
      take: MAX_ERRORS
    });

    if (logs.length === 0) {
      await ctx.reply(`Ошибок за период ${period.label} не найдено.`);
      return;
    }

    const lines = [`Ошибки за период ${period.label} (последние ${logs.length}):`];
    for (const [index, log] of logs.entries()) {
      const time = formatDateTime(log.createdAt, env.timezone);
      const who = [log.fromId ? `from:${log.fromId}` : null, log.chatId ? `chat:${log.chatId}` : null]
        .filter(Boolean)
        .join(" ");
      const updatePart = log.updateType ? ` (${log.updateType})` : "";
      const message = truncateLine(log.errorMsg ?? log.errorName ?? "—");
      lines.push(`${index + 1}) ${time} | ${log.kind}${updatePart} | ${who || "—"} | ${message}`);
    }

    const keyboard = buildDetailKeyboard(logs.map((log) => log.id));
    await ctx.reply(lines.join("\n"), keyboard);
  });

  bot.action(/^errors:detail:/, guard, async (ctx) => {
    await ctx.answerCbQuery();
    const data = "data" in ctx.callbackQuery ? ctx.callbackQuery.data : "";
    const parts = data.split(":");
    const id = parts[2];
    if (!id) {
      return;
    }

    const log = await prisma.eventLog.findUnique({ where: { id } });
    if (!log) {
      await ctx.reply("Запись не найдена.");
      return;
    }

    const lines = [
      "Детали ошибки:",
      `Дата/время: ${formatDateTime(log.createdAt, env.timezone)}`,
      `Тип: ${log.kind}`,
      `Update type: ${log.updateType ?? "—"}`,
      `chatId: ${log.chatId ?? "—"}`,
      `fromId: ${log.fromId ?? "—"}`,
      `messageId: ${log.messageId ?? "—"}`,
      `Имя: ${log.errorName ?? "—"}`,
      `Сообщение: ${formatLines(log.errorMsg, 4, 1000)}`,
      `Стек:\n${formatLines(log.errorStack, 20, 3000)}`,
      `Meta:\n${formatMeta(log.meta)}`
    ];

    const chunks = splitMessage(lines.join("\n"));
    for (const chunk of chunks) {
      await ctx.reply(chunk);
    }
  });
};
