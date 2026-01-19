import { Telegraf } from "telegraf";
import { PendingActionService } from "../../services/pendingActionService";
import { AdminService } from "../../services/adminService";
import { env } from "../../config/env";
import { messages } from "../messages";
import { formatDurationMinutes } from "../../utils/format";
import { formatTime } from "../../utils/time";
import { logger } from "../../config/logger";

const parsePendingId = (data: string): number => {
  const parts = data.split(":");
  const id = Number(parts[1] ?? "0");
  return Number.isFinite(id) ? id : 0;
};

export const registerPendingActionHandlers = (
  bot: Telegraf,
  pendingActionService: PendingActionService,
  adminService: AdminService
): void => {
  bot.action(/^pending_confirm:/, async (ctx) => {
    await ctx.answerCbQuery();
    const data = "data" in ctx.callbackQuery ? ctx.callbackQuery.data : "";
    const pendingId = parsePendingId(data);
    const userId = ctx.from?.id;

    if (!pendingId || !userId) {
      return;
    }

    try {
      const result = await pendingActionService.confirmAction(pendingId, String(userId));
      const adminChatIds = await adminService.getAdminChatIds();

      if (result.type === "confirmed_start") {
        if (result.autoClose) {
          const endTime = formatTime(result.autoClose.endTime ?? new Date(), env.timezone);
          const bossAutoMessage = messages.autoClosedBoss(result.employee.displayName, endTime, env.maxShiftHours);

          for (const adminChatId of adminChatIds) {
            try {
              await bot.telegram.sendMessage(adminChatId, bossAutoMessage);
            } catch (error) {
              logger.error({ err: error, adminChatId }, "Failed to notify admin about auto-close");
            }
          }

          if (env.notifyEmployeeOnAutoClose) {
            try {
              await bot.telegram.sendMessage(
                result.employee.telegramUserId,
                messages.autoClosedEmployee(env.maxShiftHours)
              );
            } catch (error) {
              logger.error({ err: error, employeeId: result.employee.telegramUserId }, "Failed to notify employee");
            }
          }
        }

        const time = formatTime(result.shift.startTime, env.timezone);
        await ctx.reply(messages.shiftStarted(time));

        const bossMessage = messages.bossShiftStarted(result.employee.displayName, time);
        for (const adminChatId of adminChatIds) {
          try {
            await bot.telegram.sendMessage(adminChatId, bossMessage);
          } catch (error) {
            logger.error({ err: error, adminChatId }, "Failed to notify admin about shift start");
          }
        }

        return;
      }

      if (result.type === "confirmed_end") {
        const time = formatTime(result.shift.endTime ?? new Date(), env.timezone);
        const duration = formatDurationMinutes(result.durationMinutes);
        await ctx.reply(messages.shiftClosed(time, duration));

        const bossMessage = messages.bossShiftClosed(result.employee.displayName, duration);
        for (const adminChatId of adminChatIds) {
          try {
            await bot.telegram.sendMessage(adminChatId, bossMessage);
          } catch (error) {
            logger.error({ err: error, adminChatId }, "Failed to notify admin about shift close");
          }
        }

        return;
      }

      if (result.type === "auto_closed") {
        const endTime = formatTime(result.autoClose.endTime ?? new Date(), env.timezone);
        const bossMessage = messages.autoClosedBoss(
          result.autoClose.employee.displayName,
          endTime,
          env.maxShiftHours
        );

        for (const adminChatId of adminChatIds) {
          try {
            await bot.telegram.sendMessage(adminChatId, bossMessage);
          } catch (error) {
            logger.error({ err: error, adminChatId }, "Failed to notify admin about auto-close");
          }
        }

        if (env.notifyEmployeeOnAutoClose) {
          await ctx.reply(messages.autoClosedEmployee(env.maxShiftHours));
        } else {
          await ctx.reply(messages.alreadyClosed);
        }

        return;
      }

      if (result.type === "open_shift_exists") {
        await ctx.reply(messages.openShiftExists);
        return;
      }

      if (result.type === "no_open_shift") {
        await ctx.reply(messages.alreadyClosed);
        return;
      }

      if (result.type === "expired") {
        await ctx.reply(messages.pendingExpired);
        return;
      }

      if (result.type === "already_handled") {
        await ctx.reply(messages.pendingAlreadyHandled);
        return;
      }

      if (result.type === "forbidden") {
        await ctx.reply(messages.noAccess);
        return;
      }

      if (result.type === "not_found") {
        await ctx.reply(messages.pendingNotFound);
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to confirm pending action");
      await ctx.reply("Не удалось подтвердить действие. Попробуйте позже.");
    }
  });

  bot.action(/^pending_cancel:/, async (ctx) => {
    await ctx.answerCbQuery();
    const data = "data" in ctx.callbackQuery ? ctx.callbackQuery.data : "";
    const pendingId = parsePendingId(data);
    const userId = ctx.from?.id;

    if (!pendingId || !userId) {
      return;
    }

    try {
      const result = await pendingActionService.cancelAction(pendingId, String(userId));
      if (result.type === "cancelled") {
        await ctx.reply(messages.pendingCancelled);
        return;
      }

      if (result.type === "expired") {
        await ctx.reply(messages.pendingExpired);
        return;
      }

      if (result.type === "already_handled") {
        await ctx.reply(messages.pendingAlreadyHandled);
        return;
      }

      if (result.type === "forbidden") {
        await ctx.reply(messages.noAccess);
        return;
      }

      if (result.type === "not_found") {
        await ctx.reply(messages.pendingNotFound);
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to cancel pending action");
      await ctx.reply("Не удалось отменить действие. Попробуйте позже.");
    }
  });
};
