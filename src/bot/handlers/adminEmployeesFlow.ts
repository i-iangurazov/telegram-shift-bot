import { Context, Telegraf } from "telegraf";
import { EmployeeRepository } from "../../repositories/employeeRepository";
import { AdminService } from "../../services/adminService";
import { ReportService } from "../../services/reportService";
import { ExportService } from "../../services/exportService";
import { PhotoReviewService, PhotoRangeKey } from "../../services/photoReviewService";
import { ViolationType } from "@prisma/client";
import { adminGuard } from "../middleware/adminGuard";
import { messages } from "../messages";
import {
  buildEmployeeListKeyboard,
  buildEmployeePeriodKeyboard,
  buildEmployeeReportPaginationKeyboard,
  buildEmployeeActionKeyboard,
  buildPhotoPeriodKeyboard,
  buildPhotoShiftListKeyboard
} from "../keyboards/adminReportKeyboards";
import { buildEmployeeReportMessage } from "../formatters/adminReportFormatter";
import { formatViolationsList, formatViolationsPresence } from "../formatters/violationFormatter";
import { env } from "../../config/env";
import { adminKeyboard } from "../keyboards/roleKeyboards";
import { logger } from "../../config/logger";
import { formatDurationMinutes } from "../../utils/format";
import { formatDateTime, formatShortDateTime } from "../../utils/time";
import {
  ReportPeriodKey,
  resolveReportRangeToken
} from "../reports/reportPeriods";

const PAGE_SIZE = 8;

const parseEmployeesQuery = (text: string): string => {
  const parts = text.trim().split(" ");
  if (parts.length <= 1) {
    return "";
  }
  return parts.slice(1).join(" ").trim().slice(0, 30);
};

const parseEmpPageData = (data: string): { page: number; query: string } => {
  const parts = data.split(":");
  const page = Number(parts[1] ?? "1");
  const query = decodeURIComponent(parts[2] ?? "");
  return { page: Number.isFinite(page) && page > 0 ? page : 1, query };
};

const parseEmpSelectData = (data: string): { employeeId: number; page: number; query: string } => {
  const parts = data.split(":");
  const employeeId = Number(parts[1] ?? "0");
  const page = Number(parts[2] ?? "1");
  const query = decodeURIComponent(parts[3] ?? "");
  return {
    employeeId: Number.isFinite(employeeId) ? employeeId : 0,
    page: Number.isFinite(page) && page > 0 ? page : 1,
    query
  };
};

const parseEmpActionData = (data: string): { action: string; employeeId: number; page: number; query: string } => {
  const parts = data.split(":");
  const action = parts[1] ?? "";
  const employeeId = Number(parts[2] ?? "0");
  const page = Number(parts[3] ?? "1");
  const query = decodeURIComponent(parts[4] ?? "");
  return {
    action,
    employeeId: Number.isFinite(employeeId) ? employeeId : 0,
    page: Number.isFinite(page) && page > 0 ? page : 1,
    query
  };
};

const parsePeriodEmpData = (data: string): { periodToken: string; employeeId: number } => {
  const parts = data.split(":");
  const periodToken = parts[1] ?? "";
  const employeeId = Number(parts[2] ?? "0");
  return {
    periodToken,
    employeeId: Number.isFinite(employeeId) ? employeeId : 0
  };
};

const parsePhotoPeriodData = (data: string): { range: PhotoRangeKey; employeeId: number; page: number; query: string } => {
  const parts = data.split(":");
  const range = (parts[1] ?? "last3") as PhotoRangeKey;
  const employeeId = Number(parts[2] ?? "0");
  const page = Number(parts[3] ?? "1");
  const query = decodeURIComponent(parts[4] ?? "");
  return {
    range,
    employeeId: Number.isFinite(employeeId) ? employeeId : 0,
    page: Number.isFinite(page) && page > 0 ? page : 1,
    query
  };
};

const buildShiftLabel = (params: {
  startTime: Date;
  closedReason: string | null;
  violations: ViolationType[];
  timezone: string;
}): string => {
  const when = formatShortDateTime(params.startTime, params.timezone);
  const reason = params.closedReason === "AUTO_TIMEOUT"
    ? "Авто12ч"
    : params.closedReason === "USER_PHOTO"
      ? "Фото"
      : "Открыта";
  const violation = formatViolationsPresence(params.violations);
  return `${when} — ${reason} — ${violation}`;
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

export const registerAdminEmployeesFlow = (
  bot: Telegraf,
  adminService: AdminService,
  employeeRepo: EmployeeRepository,
  reportService: ReportService,
  exportService: ExportService,
  photoReviewService: PhotoReviewService
): void => {
  const guard = adminGuard(adminService);

  const showEmployeeList = async (ctx: Context, params: { page: number; query: string }) => {
    const { items, total } = await employeeRepo.listEmployees({
      page: params.page,
      pageSize: PAGE_SIZE,
      query: params.query
    });
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    if (total === 0) {
      await ctx.reply(messages.noEmployeesFound);
      return;
    }

    const prompt = params.query
      ? `${messages.employeesChoosePrompt}\nПоиск: ${params.query}`
      : messages.employeesChoosePrompt;

    await ctx.reply(
      prompt,
      buildEmployeeListKeyboard({
        employees: items,
        page: Math.min(params.page, totalPages),
        totalPages,
        query: params.query
      })
    );
  };

  const showEmployeeActionMenu = async (ctx: Context, params: { employeeId: number; page: number; query: string }) => {
    const employee = await employeeRepo.findById(params.employeeId);
    if (!employee) {
      await ctx.reply(messages.noEmployeesFound);
      return;
    }

    await ctx.reply(
      messages.employeeActionPrompt(employee.displayName),
      buildEmployeeActionKeyboard({
        employeeId: employee.id,
        page: params.page,
        query: params.query
      })
    );
  };

  bot.command("employees", guard, async (ctx) => {
    const text = "text" in ctx.message ? ctx.message.text : "";
    const query = parseEmployeesQuery(text);
    await showEmployeeList(ctx, { page: 1, query });
  });

  bot.hears("Сотрудники", guard, async (ctx) => {
    await showEmployeeList(ctx, { page: 1, query: "" });
  });

  bot.action(/^emp_page:/, guard, async (ctx) => {
    await ctx.answerCbQuery();
    const data = "data" in ctx.callbackQuery ? ctx.callbackQuery.data : "";
    const { page, query } = parseEmpPageData(data);
    await showEmployeeList(ctx, { page, query });
  });

  bot.action(/^emp_select:/, guard, async (ctx) => {
    await ctx.answerCbQuery();
    const data = "data" in ctx.callbackQuery ? ctx.callbackQuery.data : "";
    const parsed = parseEmpSelectData(data);

    if (!parsed.employeeId) {
      await ctx.reply(messages.noEmployeesFound);
      return;
    }

    await showEmployeeActionMenu(ctx, {
      employeeId: parsed.employeeId,
      page: parsed.page,
      query: parsed.query
    });
  });

  bot.action(/^emp_action:/, guard, async (ctx) => {
    await ctx.answerCbQuery();
    const data = "data" in ctx.callbackQuery ? ctx.callbackQuery.data : "";
    const parsed = parseEmpActionData(data);

    if (!parsed.employeeId) {
      await ctx.reply(messages.noEmployeesFound);
      return;
    }

    if (parsed.action === "menu") {
      await showEmployeeActionMenu(ctx, {
        employeeId: parsed.employeeId,
        page: parsed.page,
        query: parsed.query
      });
      return;
    }

    const employee = await employeeRepo.findById(parsed.employeeId);
    if (!employee) {
      await ctx.reply(messages.noEmployeesFound);
      return;
    }

    if (parsed.action === "report") {
      await ctx.reply(
        messages.employeePeriodPrompt(employee.displayName),
        buildEmployeePeriodKeyboard({
          employeeId: parsed.employeeId,
          backPage: parsed.page,
          query: parsed.query,
          backAction: `emp_action:menu:${parsed.employeeId}:${parsed.page}:${encodeURIComponent(parsed.query)}`
        })
      );
      return;
    }

    if (parsed.action === "photos") {
      await ctx.reply(
        messages.photoPeriodPrompt(employee.displayName),
        buildPhotoPeriodKeyboard({
          employeeId: parsed.employeeId,
          page: parsed.page,
          query: parsed.query
        })
      );
    }
  });

  bot.action(/^emp_search$/, guard, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(messages.searchHint);
  });

  bot.action(/^emp_back$/, guard, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(messages.startAdmin, adminKeyboard);
  });

  bot.action(/^period_emp:/, guard, async (ctx) => {
    await ctx.answerCbQuery();
    const data = "data" in ctx.callbackQuery ? ctx.callbackQuery.data : "";
    const { periodToken, employeeId } = parsePeriodEmpData(data);
    const period = resolvePeriodToken(periodToken);

    if (!period || !employeeId) {
      return;
    }

    try {
      const report = await reportService.getEmployeeReport(employeeId, period.range, { page: 0, pageSize: 10 });
      if (!report) {
        await ctx.reply(messages.noEmployeesFound);
        return;
      }

      const message = buildEmployeeReportMessage(report, env.timezone);
      const keyboard = buildEmployeeReportPaginationKeyboard({
        employeeId,
        periodKey: period.periodKey,
        page: report.page,
        pageSize: report.pageSize,
        totalShifts: report.totalShifts
      });
      await ctx.reply(message, keyboard);
    } catch (error) {
      logger.error({ err: error }, "Failed to build employee report");
      await ctx.reply("Не удалось сформировать отчёт. Попробуйте позже.");
    }
  });

  bot.action(/^emp_rep:/, guard, async (ctx) => {
    await ctx.answerCbQuery();
    const data = "data" in ctx.callbackQuery ? ctx.callbackQuery.data : "";
    const parts = data.split(":");
    const employeeId = Number(parts[1] ?? "0");
    const periodToken = parts[2] ?? "";
    const page = Number(parts[3] ?? "0");
    const period = resolvePeriodToken(periodToken);

    if (!employeeId || !period || !Number.isFinite(page)) {
      await ctx.reply("Данные устарели. Сформируйте отчёт заново.");
      return;
    }

    try {
      const report = await reportService.getEmployeeReport(employeeId, period.range, { page, pageSize: 10 });
      if (!report) {
        await ctx.reply("Данные устарели. Сформируйте отчёт заново.");
        return;
      }

      const message = buildEmployeeReportMessage(report, env.timezone);
      const keyboard = buildEmployeeReportPaginationKeyboard({
        employeeId,
        periodKey: period.periodKey,
        page: report.page,
        pageSize: report.pageSize,
        totalShifts: report.totalShifts
      });

      try {
        await ctx.editMessageText(message, keyboard);
      } catch (editError) {
        logger.warn({ err: editError }, "Failed to edit employee report message");
        await ctx.reply("Данные устарели. Сформируйте отчёт заново.");
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to paginate employee report");
      await ctx.reply("Не удалось сформировать отчёт. Попробуйте позже.");
    }
  });

  bot.action(/^emp_photo_period:/, guard, async (ctx) => {
    await ctx.answerCbQuery();
    const data = "data" in ctx.callbackQuery ? ctx.callbackQuery.data : "";
    const parsed = parsePhotoPeriodData(data);

    if (!parsed.employeeId || !parsed.range) {
      return;
    }

    try {
      const employee = await employeeRepo.findById(parsed.employeeId);
      if (!employee) {
        await ctx.reply(messages.noEmployeesFound);
        return;
      }

      const range = photoReviewService.buildRange(parsed.range, env.timezone, new Date());
      const shifts = await photoReviewService.listEmployeeShifts(employee.id, range, 10);
      if (shifts.length === 0) {
        await ctx.reply(messages.photoShiftsEmpty);
        return;
      }

      const items = shifts.map((shift) => ({
        id: shift.id,
        label: buildShiftLabel({
          startTime: shift.startTime,
          closedReason: shift.closedReason,
          violations: shift.violations,
          timezone: env.timezone
        })
      }));

      await ctx.reply(
        `Фото: ${range.label}. Выберите смену:`,
        buildPhotoShiftListKeyboard({
          shifts: items,
          employeeId: employee.id,
          page: parsed.page,
          query: parsed.query
        })
      );
    } catch (error) {
      logger.error({ err: error }, "Failed to build photo shift list");
      await ctx.reply("Не удалось загрузить список смен. Попробуйте позже.");
    }
  });

  bot.action(/^emp_photo_shift:/, guard, async (ctx) => {
    await ctx.answerCbQuery();
    const data = "data" in ctx.callbackQuery ? ctx.callbackQuery.data : "";
    const parts = data.split(":");
    const shiftId = Number(parts[1] ?? "0");

    if (!shiftId) {
      return;
    }

    try {
      const shift = await photoReviewService.getShiftDetails(shiftId);
      if (!shift) {
        await ctx.reply(messages.shiftNotFound);
        return;
      }

      const retentionCutoff = new Date(Date.now() - env.photoRetentionDays * 24 * 60 * 60 * 1000);
      const isPurged = Boolean(shift.photosPurgedAt) || shift.startTime < retentionCutoff;
      const startPhotoId = isPurged ? null : shift.startPhotoFileId;
      const endPhotoId = isPurged ? null : shift.endPhotoFileId;

      const startTime = formatDateTime(shift.startTime, env.timezone);
      const endTime = shift.endTime ? formatDateTime(shift.endTime, env.timezone) : "Открыта";
      const duration = shift.durationMinutes != null ? formatDurationMinutes(shift.durationMinutes) : "—";
      const reason = shift.closedReason === "AUTO_TIMEOUT"
        ? "Автоматически (12 часов)"
        : shift.closedReason === "USER_PHOTO"
          ? "Фото"
          : "—";
      const violations = shift.violations.map((violation) => violation.type);
      const violationsText = shift.endTime ? formatViolationsList(violations) : "—";

      await ctx.reply(
        "Смена: детали\n" +
        `Сотрудник: ${shift.employee.displayName}\n` +
        `Период: ${startTime} – ${endTime}\n` +
        `Длительность: ${duration}\n` +
        `Способ закрытия: ${reason}\n` +
        `Нарушения: ${violationsText}`
      );

      if (startPhotoId) {
        await ctx.replyWithPhoto(startPhotoId, { caption: "Фото начала смены" });
      } else {
        await ctx.reply(messages.photoStartMissing);
      }

      if (!shift.endTime) {
        await ctx.reply(messages.photoEndNotClosed);
        return;
      }

      if (endPhotoId) {
        await ctx.replyWithPhoto(endPhotoId, { caption: "Фото окончания смены" });
        return;
      }

      if (shift.closedReason === "AUTO_TIMEOUT") {
        await ctx.reply(messages.photoEndAutoClosed);
        return;
      }

      await ctx.reply(messages.photoEndMissing);
    } catch (error) {
      logger.error({ err: error }, "Failed to send shift photos");
      await ctx.reply("Не удалось загрузить фото смены. Попробуйте позже.");
    }
  });

  bot.action(/^export_emp:/, guard, async (ctx) => {
    await ctx.answerCbQuery();
    const data = "data" in ctx.callbackQuery ? ctx.callbackQuery.data : "";
    const parts = data.split(":");
    const format = parts[1];
    const periodToken = parts[2] ?? "";
    const employeeId = Number(parts[3] ?? "0");
    const period = resolvePeriodToken(periodToken);

    if (format !== "csv" || !period || !employeeId) {
      return;
    }

    try {
      const report = await reportService.getEmployeeReport(employeeId, period.range);
      if (!report) {
        await ctx.reply(messages.noEmployeesFound);
        return;
      }
      const shifts = await reportService.getEmployeeShiftsForExport(employeeId, period.range);
      const reportForExport = { ...report, shifts };
      const file = exportService.buildEmployeeReportCsv(reportForExport, env.timezone);
      await ctx.replyWithDocument({ source: file.content, filename: file.filename });
    } catch (error) {
      logger.error({ err: error }, "Failed to export employee report");
      await ctx.reply("Не удалось сформировать файл. Попробуйте позже.");
    }
  });

  bot.action(/^emp_rep_export:/, guard, async (ctx) => {
    await ctx.answerCbQuery();
    const data = "data" in ctx.callbackQuery ? ctx.callbackQuery.data : "";
    const parts = data.split(":");
    const employeeId = Number(parts[1] ?? "0");
    const periodToken = parts[2] ?? "";
    const period = resolvePeriodToken(periodToken);

    if (!employeeId || !period) {
      await ctx.reply("Данные устарели. Сформируйте отчёт заново.");
      return;
    }

    try {
      const report = await reportService.getEmployeeReport(employeeId, period.range);
      if (!report) {
        await ctx.reply(messages.noEmployeesFound);
        return;
      }
      const shifts = await reportService.getEmployeeShiftsForExport(employeeId, period.range);
      const reportForExport = { ...report, shifts };
      const file = exportService.buildEmployeeReportCsv(reportForExport, env.timezone);
      await ctx.replyWithDocument({ source: file.content, filename: file.filename });
    } catch (error) {
      logger.error({ err: error }, "Failed to export employee report");
      await ctx.reply("Не удалось сформировать файл. Попробуйте позже.");
    }
  });
};
