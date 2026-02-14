import { Context, Telegraf } from "telegraf";
import { AdminService } from "../../services/adminService";
import { ReportService } from "../../services/reportService";
import { ExportService } from "../../services/exportService";
import { adminGuard } from "../middleware/adminGuard";
import { buildAllEmployeesReportMessage } from "../formatters/adminReportFormatter";
import { buildAllExportKeyboard, buildAllPeriodKeyboard } from "../keyboards/adminReportKeyboards";
import { messages } from "../messages";
import { env } from "../../config/env";
import { splitMessage } from "../formatters/reportFormatter";
import { logger } from "../../config/logger";
import {
  ReportPeriodKey,
  resolveReportRangeToken
} from "../reports/reportPeriods";

const parsePeriodAllData = (data: string): string => {
  const parts = data.split(":");
  return parts[1] ?? "";
};

const mapLegacyDaysToPeriodKey = (days: number): ReportPeriodKey => {
  if (days <= 3) {
    return "3d";
  }
  if (days <= 7) {
    return "7d";
  }
  if (days <= 30) {
    return "30d";
  }
  if (days >= 330) {
    return "12m";
  }
  return "30d";
};

const resolvePeriodToken = (
  token: string
): { range: { from: Date; to: Date; days: number }; periodKey: ReportPeriodKey } | null => {
  const resolved = resolveReportRangeToken({
    token,
    timezone: env.timezone
  });
  if (!resolved) {
    return null;
  }
  return {
    range: resolved.range,
    periodKey: resolved.periodKey ?? mapLegacyDaysToPeriodKey(resolved.range.days)
  };
};

export const registerAdminReportFlow = (
  bot: Telegraf,
  adminService: AdminService,
  reportService: ReportService,
  exportService: ExportService
): void => {
  const guard = adminGuard(adminService);

  const showPeriodSelection = async (ctx: Context): Promise<void> => {
    await ctx.reply(messages.reportAllPrompt, buildAllPeriodKeyboard());
  };

  bot.command("report", guard, async (ctx) => {
    await showPeriodSelection(ctx);
  });

  bot.hears("Отчёт", guard, async (ctx) => {
    await showPeriodSelection(ctx);
  });

  bot.action(/^period_all:/, guard, async (ctx) => {
    await ctx.answerCbQuery();
    const data = "data" in ctx.callbackQuery ? ctx.callbackQuery.data : "";
    const periodToken = parsePeriodAllData(data);
    const period = resolvePeriodToken(periodToken);
    if (!period) {
      return;
    }

    try {
      const report = await reportService.getAllEmployeesReport(period.range);
      const message = buildAllEmployeesReportMessage(report, env.timezone);
      const chunks = splitMessage(message);
      for (const chunk of chunks) {
        await ctx.reply(chunk);
      }
      await ctx.reply("Экспорт:", buildAllExportKeyboard(period.periodKey));
    } catch (error) {
      logger.error({ err: error }, "Failed to build all employees report");
      await ctx.reply("Не удалось сформировать отчёт. Попробуйте позже.");
    }
  });

  bot.action(/^export_all:/, guard, async (ctx) => {
    await ctx.answerCbQuery();
    const data = "data" in ctx.callbackQuery ? ctx.callbackQuery.data : "";
    const parts = data.split(":");
    const format = parts[1];
    const periodToken = parts[2] ?? "";
    const period = resolvePeriodToken(periodToken);

    if (format !== "csv" || !period) {
      return;
    }

    try {
      const report = await reportService.getAllEmployeesReport(period.range);
      const file = exportService.buildAllEmployeesSummaryCsv(report.period, report.employees, env.timezone);
      await ctx.replyWithDocument({ source: file.content, filename: file.filename });

      const rawExport = await reportService.getRawShiftsForExport(period.range, 2000);
      if (rawExport.shifts.length > 0 && rawExport.shifts.length < 2000) {
        const rawFile = exportService.buildRawShiftsCsv(rawExport.period, rawExport.shifts, env.timezone);
        await ctx.replyWithDocument({ source: rawFile.content, filename: rawFile.filename });
      } else if (rawExport.shifts.length >= 2000) {
        await ctx.reply(messages.exportSkipped);
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to export all employees report");
      await ctx.reply("Не удалось сформировать файл. Попробуйте позже.");
    }
  });
};
