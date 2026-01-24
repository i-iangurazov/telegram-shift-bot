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
import { registerStartCommand } from "./handlers/startCommand";
import { registerStatusCommand } from "./handlers/statusCommand";
import { registerAdminEmployeesFlow } from "./handlers/adminEmployeesFlow";
import { registerAdminReportFlow } from "./handlers/adminReportFlow";
import { registerAdminErrorsCommand } from "./handlers/adminErrorsCommand";
import { registerPhotoHandler } from "./handlers/photoHandler";
import { registerPendingActionHandlers } from "./handlers/pendingActionHandlers";
import { registerTextHandler } from "./handlers/textHandler";
import { registerWhoamiCommand } from "./handlers/whoamiCommand";
import { registerSetAdminCommand } from "./handlers/setAdminCommand";
import { registerHelpCommand } from "./handlers/helpCommand";
import { registerModeCommand } from "./handlers/modeCommand";
import { registerFullNameCommand } from "./handlers/fullNameCommand";
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

  registerStartCommand(bot, deps.roleService, deps.employeeRepo, deps.userSessionRepo);
  registerStatusCommand(bot, deps.shiftService, deps.roleService);
  registerWhoamiCommand(bot);
  registerHelpCommand(bot, deps.roleService);
  registerModeCommand(bot, deps.roleService);
  registerFullNameCommand(bot, deps.roleService, deps.employeeRepo, deps.userSessionRepo);
  registerSetAdminCommand(bot, deps.adminService);
  registerAdminEmployeesFlow(
    bot,
    deps.adminService,
    deps.employeeRepo,
    deps.reportService,
    deps.exportService,
    deps.photoReviewService
  );
  registerAdminReportFlow(bot, deps.adminService, deps.reportService, deps.exportService);
  registerAdminErrorsCommand(bot, deps.adminService);
  registerPhotoHandler(bot, deps.roleService, deps.pendingActionService);
  registerPendingActionHandlers(bot, deps.pendingActionService, deps.adminService);
  registerTextHandler(bot, deps.roleService, deps.employeeRepo, deps.userSessionRepo, deps.pendingActionService);

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
