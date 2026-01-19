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

const parsePeriodAllData = (data: string): number => {
  const parts = data.split(":");
  const days = Number(parts[1] ?? "0");
  return Number.isFinite(days) ? days : 0;
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
    const days = parsePeriodAllData(data);
    if (!days) {
      return;
    }

    try {
      const report = await reportService.getAllEmployeesReport(days);
      const message = buildAllEmployeesReportMessage(report, env.timezone);
      const chunks = splitMessage(message);
      for (const chunk of chunks) {
        await ctx.reply(chunk);
      }
      await ctx.reply("Экспорт:", buildAllExportKeyboard(days));
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
    const days = Number(parts[2] ?? "0");

    if (format !== "csv" || !days) {
      return;
    }

    try {
      const report = await reportService.getAllEmployeesReport(days);
      const file = exportService.buildAllEmployeesSummaryCsv(report.period, report.employees, env.timezone);
      await ctx.replyWithDocument({ source: file.content, filename: file.filename });

      const rawExport = await reportService.getRawShiftsForExport(days, new Date(), 2000);
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
