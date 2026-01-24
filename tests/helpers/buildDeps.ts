import { prisma } from "../../src/db/prisma";
import { env } from "../../src/config/env";
import { logger } from "../../src/config/logger";
import { PrismaEmployeeRepository } from "../../src/repositories/employeeRepository";
import { PrismaShiftRepository } from "../../src/repositories/shiftRepository";
import { PrismaAdminRepository } from "../../src/repositories/adminRepository";
import { PrismaUserSessionRepository } from "../../src/repositories/userSessionRepository";
import { PrismaPendingActionRepository } from "../../src/repositories/pendingActionRepository";
import { ShiftService } from "../../src/services/shiftService";
import { ReportService } from "../../src/services/reportService";
import { AdminService } from "../../src/services/adminService";
import { RoleService } from "../../src/services/roleService";
import { ExportService } from "../../src/services/exportService";
import { PendingActionService } from "../../src/services/pendingActionService";
import { PhotoReviewService } from "../../src/services/photoReviewService";

export const buildDeps = () => {
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

  return {
    prisma,
    employeeRepo,
    shiftRepo,
    adminRepo,
    userSessionRepo,
    pendingActionRepo,
    adminService,
    shiftService,
    reportService,
    roleService,
    exportService,
    pendingActionService,
    photoReviewService
  };
};
