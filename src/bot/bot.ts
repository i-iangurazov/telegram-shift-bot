import { Telegraf } from "telegraf";
import { env } from "../config/env";
import { ShiftService } from "../services/shiftService";
import { ReportService } from "../services/reportService";
import { AdminService } from "../services/adminService";
import { RoleService } from "../services/roleService";
import { EmployeeRepository } from "../repositories/employeeRepository";
import { UserSessionRepository } from "../repositories/userSessionRepository";
import { ExportService } from "../services/exportService";
import { PendingActionService } from "../services/pendingActionService";
import { PhotoReviewService } from "../services/photoReviewService";
import { registerCommands } from "./registerCommands";
import { applySafeTelegram } from "./safeTelegram";
import { prisma } from "../db/prisma";
import { logEvent } from "../server/logging/eventLog";

export const createBot = (deps: {
  shiftService: ShiftService;
  reportService: ReportService;
  adminService: AdminService;
  roleService: RoleService;
  employeeRepo: EmployeeRepository;
  userSessionRepo: UserSessionRepository;
  exportService: ExportService;
  pendingActionService: PendingActionService;
  photoReviewService: PhotoReviewService;
}): Telegraf => {
  const bot = new Telegraf(env.telegramBotToken);
  applySafeTelegram(bot.telegram);

  registerCommands(bot, deps);

  bot.catch(async (error, ctx) => {
    console.error(
      "telegraf_error",
      {
        update_id: ctx.update?.update_id,
        updateType: ctx.updateType,
        chatId: ctx.chat?.id,
        fromId: ctx.from?.id
      },
      error
    );
    try {
      const message = (ctx.message as any) ?? (ctx.update as any)?.message;
      const callbackQuery = (ctx.callbackQuery as any) ?? (ctx.update as any)?.callback_query;
      const update = ctx.update as any;
      const callbackData = callbackQuery?.data;

      await logEvent(prisma, {
        level: "error",
        kind: "telegraf_error",
        updateId: typeof update?.update_id === "number" ? update.update_id : undefined,
        updateType: ctx.updateType,
        chatId: ctx.chat?.id,
        fromId: ctx.from?.id,
        messageId: message?.message_id ?? callbackQuery?.message?.message_id,
        meta: {
          hasPhoto: Boolean(message?.photo?.length),
          hasText: Boolean(message?.text),
          hasCaption: Boolean(message?.caption),
          mediaGroupId: message?.media_group_id ? String(message.media_group_id) : undefined,
          callbackDataPrefix: typeof callbackData === "string" ? callbackData.slice(0, 20) : undefined
        },
        err: error
      });
    } catch (logError) {
      // avoid recursive failures in error handler
      console.error("Failed to log telegraf error", logError);
    }
  });

  return bot;
};
