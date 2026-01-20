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
import { registerPhotoHandler } from "./handlers/photoHandler";
import { registerPendingActionHandlers } from "./handlers/pendingActionHandlers";
import { registerTextHandler } from "./handlers/textHandler";
import { registerWhoamiCommand } from "./handlers/whoamiCommand";
import { registerSetAdminCommand } from "./handlers/setAdminCommand";
import { registerHelpCommand } from "./handlers/helpCommand";
import { registerModeCommand } from "./handlers/modeCommand";

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
  registerPhotoHandler(bot, deps.roleService, deps.pendingActionService);
  registerPendingActionHandlers(bot, deps.pendingActionService, deps.adminService);
  registerTextHandler(bot, deps.roleService, deps.employeeRepo, deps.userSessionRepo, deps.pendingActionService);

  return bot;
};
