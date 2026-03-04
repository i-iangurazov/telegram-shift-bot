import { DailyDigestReport, WeeklyDigestReport } from "../../services/digestService";
import { formatDurationMinutes } from "../../utils/format";
import { formatDate, formatShortDateTime, formatTime } from "../../utils/time";
import { messages } from "../messages";

const formatDailyEnd = (date: Date | null, timezone: string): string => {
  if (!date) {
    return "не закрыл";
  }
  return formatTime(date, timezone);
};

const formatWeeklyEnd = (date: Date | null, timezone: string): string => {
  if (!date) {
    return "не закрыл";
  }
  return formatShortDateTime(date, timezone);
};

export const buildDailyDigestMessage = (report: DailyDigestReport): string => {
  const lines: string[] = [];
  lines.push("Дневной отчёт");
  lines.push(`Дата: ${formatDate(report.range.from, report.timezone)}`);

  if (report.employees.length === 0) {
    lines.push(messages.reportEmpty);
  } else {
    report.employees.forEach((employee, index) => {
      const start = formatTime(employee.firstShiftStart, report.timezone);
      const end = formatDailyEnd(employee.lastShiftEnd, report.timezone);
      lines.push(
        `${index + 1}. ${employee.displayName} — старт: ${start}, финиш: ${end}, время: ${formatDurationMinutes(employee.totalDurationMinutes)}, нарушений: ${employee.violationsNotClosedInTime}`
      );
    });
  }

  lines.push(
    `Итого: сотрудников ${report.totals.totalEmployees}, смен ${report.totals.totalShifts}, время ${formatDurationMinutes(report.totals.totalDurationMinutes)}, нарушений ${report.totals.violationsNotClosedInTime}, не закрыли ${report.totals.notClosedEmployees}`
  );

  return lines.join("\n");
};

export const buildWeeklyDigestMessage = (report: WeeklyDigestReport): string => {
  const lines: string[] = [];
  lines.push("Еженедельный отчёт");
  lines.push(`Период: ${formatDate(report.range.from, report.timezone)} – ${formatDate(report.range.to, report.timezone)}`);

  if (report.employees.length === 0) {
    lines.push(messages.reportEmpty);
  } else {
    report.employees.forEach((employee, index) => {
      const lastStart = formatShortDateTime(employee.lastShiftStart, report.timezone);
      const lastEnd = formatWeeklyEnd(employee.lastShiftEnd, report.timezone);
      lines.push(
        `${index + 1}. ${employee.displayName} — смен: ${employee.shiftsCount}, время: ${formatDurationMinutes(employee.totalDurationMinutes)}, нарушений: ${employee.violationsNotClosedInTime}, последняя: ${lastStart}–${lastEnd}`
      );
    });
  }

  lines.push(
    `Итого: сотрудников ${report.totals.totalEmployees}, смен ${report.totals.totalShifts}, время ${formatDurationMinutes(report.totals.totalDurationMinutes)}, нарушений ${report.totals.violationsNotClosedInTime}`
  );

  return lines.join("\n");
};
