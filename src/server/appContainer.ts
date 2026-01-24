import { prisma } from "../db/prisma";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { PrismaEmployeeRepository } from "../repositories/employeeRepository";
import { PrismaShiftRepository } from "../repositories/shiftRepository";
import { PrismaAdminRepository } from "../repositories/adminRepository";
import { PrismaUserSessionRepository } from "../repositories/userSessionRepository";
import { PrismaPendingActionRepository } from "../repositories/pendingActionRepository";
import { ShiftService } from "../services/shiftService";
import { ReportService } from "../services/reportService";
import { AdminService } from "../services/adminService";
import { RoleService } from "../services/roleService";
import { ExportService } from "../services/exportService";
import { PendingActionService } from "../services/pendingActionService";
import { PhotoReviewService } from "../services/photoReviewService";
import { createBot } from "../bot/bot";
import { logEvent } from "./logging/eventLog";

export interface AppContainer {
  prisma: typeof prisma;
  bot: ReturnType<typeof createBot>;
  employeeRepo: PrismaEmployeeRepository;
  userSessionRepo: PrismaUserSessionRepository;
  shiftRepo: PrismaShiftRepository;
  shiftService: ShiftService;
  adminService: AdminService;
  roleService: RoleService;
  reportService: ReportService;
  exportService: ExportService;
  pendingActionService: PendingActionService;
  photoReviewService: PhotoReviewService;
}

const globalForApp = globalThis as unknown as {
  __shiftBotApp?: Promise<AppContainer> | AppContainer;
};

export const getApp = async (): Promise<AppContainer> => {
  if (!globalForApp.__shiftBotApp) {
    globalForApp.__shiftBotApp = (async () => {
      const maxAttempts = 3;
      let lastError: unknown = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          await prisma.$connect();
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          try {
            await logEvent(prisma, {
              level: "error",
              kind: "prisma_connect_error",
              meta: { attempt, maxAttempts },
              err: error
            });
          } catch {
            // ignore logging failures
          }
          const delay = 200 * attempt + Math.floor(Math.random() * 100);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
      if (lastError) {
        throw lastError;
      }

      const employeeRepo = new PrismaEmployeeRepository();
      const shiftRepo = new PrismaShiftRepository();
      const adminRepo = new PrismaAdminRepository();
      const userSessionRepo = new PrismaUserSessionRepository();
      const pendingActionRepo = new PrismaPendingActionRepository();

      const adminService = new AdminService(adminRepo);
      const shiftService = new ShiftService(
        employeeRepo,
        shiftRepo,
        {
          maxShiftHours: env.maxShiftHours,
          minShiftMinutes: env.minShiftHours * 60,
          shortShiftGraceMinutes: env.shortShiftGraceMinutes
        },
        logger
      );
      const reportService = new ReportService(shiftRepo, employeeRepo);
      const roleService = new RoleService(adminService, employeeRepo, userSessionRepo);
      const exportService = new ExportService();
      const photoReviewService = new PhotoReviewService(shiftRepo);
      const pendingActionService = new PendingActionService(
        employeeRepo,
        shiftRepo,
        pendingActionRepo,
        {
          ttlMinutes: env.pendingActionTtlMinutes,
          maxShiftHours: env.maxShiftHours,
          minShiftMinutes: env.minShiftHours * 60,
          shortShiftGraceMinutes: env.shortShiftGraceMinutes
        },
        async (fn) => prisma.$transaction(async (tx) => fn(tx))
      );

      const bot = createBot({
        shiftService,
        reportService,
        adminService,
        roleService,
        employeeRepo,
        userSessionRepo,
        exportService,
        pendingActionService,
        photoReviewService
      });

      return {
        prisma,
        bot,
        employeeRepo,
        userSessionRepo,
        shiftRepo,
        shiftService,
        adminService,
        roleService,
        reportService,
        exportService,
        pendingActionService,
        photoReviewService
      };
    })();
  }

  return globalForApp.__shiftBotApp;
};
