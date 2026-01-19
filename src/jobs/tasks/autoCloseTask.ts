import { Telegraf } from "telegraf";
import { ShiftService } from "../../services/shiftService";
import { AdminService } from "../../services/adminService";
import { env } from "../../config/env";
import { messages } from "../../bot/messages";
import { formatTime } from "../../utils/time";
import { logger } from "../../config/logger";

export interface AutoCloseSummary {
  autoClosed: number;
  notifiedAdmins: number;
  notifiedEmployees: number;
}

export const runAutoCloseOnce = async (
  bot: Telegraf,
  shiftService: ShiftService,
  adminService: AdminService,
  options?: { now?: Date; limit?: number }
): Promise<AutoCloseSummary> => {
  const now = options?.now ?? new Date();
  const results = await shiftService.autoCloseOverdueShifts(now, options?.limit);
  if (results.length === 0) {
    return { autoClosed: 0, notifiedAdmins: 0, notifiedEmployees: 0 };
  }

  const adminChatIds = await adminService.getAdminChatIds();
  let notifiedAdmins = 0;
  let notifiedEmployees = 0;

  for (const result of results) {
    const endTime = formatTime(result.endTime, env.timezone);
    const employeeName = result.shift.employee.displayName;

    const bossMessage = messages.autoClosedBoss(employeeName, endTime, env.maxShiftHours);
    for (const adminChatId of adminChatIds) {
      try {
        await bot.telegram.sendMessage(adminChatId, bossMessage);
        notifiedAdmins += 1;
      } catch (error) {
        logger.error({ err: error, adminChatId }, "Failed to notify admin about auto-close");
      }
    }

    if (env.notifyEmployeeOnAutoClose) {
      try {
        await bot.telegram.sendMessage(
          result.shift.employee.telegramUserId,
          messages.autoClosedEmployee(env.maxShiftHours)
        );
        notifiedEmployees += 1;
      } catch (error) {
        logger.error({ err: error, employeeId: result.shift.employee.telegramUserId }, "Failed to notify employee");
      }
    }
  }

  return { autoClosed: results.length, notifiedAdmins, notifiedEmployees };
};
