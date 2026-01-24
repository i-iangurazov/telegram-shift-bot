import { ClosedReason } from "@prisma/client";
import { AllEmployeesReport, EmployeeReport } from "../../services/reportService";
import { formatDurationMinutes } from "../../utils/format";
import { formatDate, formatTime } from "../../utils/time";
import { messages } from "../messages";
import { formatViolationsList } from "./violationFormatter";

const mapClosedReason = (reason: ClosedReason | null): string => {
  if (reason === ClosedReason.AUTO_TIMEOUT) {
    return "Автоматически (12 часов)";
  }
  if (reason === ClosedReason.USER_PHOTO) {
    return "Фото";
  }
  return "—";
};

export const buildEmployeeReportMessage = (report: EmployeeReport, tz: string): string => {
  const lines: string[] = [];
  lines.push("Отчёт по сотруднику");
  lines.push(`Сотрудник: ${report.displayName}`);
  lines.push(`Период: ${formatDate(report.period.from, tz)} – ${formatDate(report.period.to, tz)}`);
  lines.push(`Количество смен: ${report.totalShifts}`);
  lines.push(`Суммарное время: ${formatDurationMinutes(report.totalDurationMinutes)}`);
  lines.push(`Средняя длительность смены: ${formatDurationMinutes(report.averageDurationMinutes)}`);
  lines.push("Нарушения:");
  lines.push(`- Не закрыл(а) смену вовремя: ${report.violationsNotClosedInTime}`);
  lines.push(`- Всего нарушений: ${report.violationsTotal}`);

  if (report.shifts.length === 0) {
    lines.push("");
    lines.push(messages.reportEmpty);
    return lines.join("\n");
  }

  lines.push("");
  const pageSize = report.pageSize || report.shifts.length || 10;
  const page = report.page ?? 0;
  const total = report.totalShifts;
  const startIndex = total === 0 ? 0 : page * pageSize + 1;
  const endIndex = total === 0 ? 0 : Math.min(total, page * pageSize + report.shifts.length);
  if (total <= pageSize) {
    lines.push("Смены:");
  } else {
    lines.push(`Смены (показаны ${startIndex}-${endIndex} из ${total}):`);
  }

  for (const shift of report.shifts) {
    const date = formatDate(shift.startTime, tz);
    const start = formatTime(shift.startTime, tz);
    if (!shift.endTime) {
      lines.push(
        `- ${date} Открыта с ${start} | Длительность: — | Закрытие: — | Нарушения: —`
      );
      continue;
    }

    const end = formatTime(shift.endTime, tz);
    const duration = shift.durationMinutes != null ? formatDurationMinutes(shift.durationMinutes) : "—";
    const closeReason = mapClosedReason(shift.closedReason);
    const violationsText = formatViolationsList(shift.violations);
    lines.push(
      `- ${date} ${start}–${end} | Длительность: ${duration} | Закрытие: ${closeReason} | Нарушения: ${violationsText}`
    );
  }

  return lines.join("\n");
};

export const buildAllEmployeesReportMessage = (report: AllEmployeesReport, tz: string): string => {
  const lines: string[] = [];
  lines.push("Сводный отчёт");
  lines.push(`Период: ${formatDate(report.period.from, tz)} – ${formatDate(report.period.to, tz)}`);
  lines.push(`Сотрудников в отчёте: ${report.totalEmployees}`);
  lines.push(`Всего смен: ${report.totalShifts}`);
  lines.push(`Суммарное время: ${formatDurationMinutes(report.totalDurationMinutes)}`);
  lines.push("Нарушения:");
  lines.push(`- Не закрыл(а) вовремя: ${report.violationsNotClosedInTime}`);
  lines.push(`- Всего нарушений: ${report.totalViolations}`);

  if (report.topEmployees.length === 0) {
    lines.push("");
    lines.push(messages.reportEmpty);
    return lines.join("\n");
  }

  lines.push("");
  lines.push("Сотрудники (топ по нарушениям, затем по часам):");
  for (const employee of report.topEmployees) {
    lines.push(
      `- ${employee.displayName} — смен: ${employee.totalShifts}, время: ${formatDurationMinutes(employee.totalDurationMinutes)}, наруш: ${employee.violationsTotal} (не закрыл: ${employee.violationsNotClosedInTime})`
    );
  }

  return lines.join("\n");
};
