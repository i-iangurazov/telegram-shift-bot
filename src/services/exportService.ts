import { ClosedReason, ViolationType } from "@prisma/client";
import { EmployeeReport, EmployeeSummary } from "./reportService";
import { formatDateForFilename, formatDateTime } from "../utils/time";

export interface ExportFile {
  filename: string;
  content: Buffer;
}

const escapeCsvValue = (value: string | number | boolean | null | undefined): string => {
  if (value === null || value === undefined) {
    return "";
  }
  const str = String(value);
  if (str.includes("\n") || str.includes(",") || str.includes("\"")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const mapClosedReason = (reason: ClosedReason | null): string => {
  if (reason === ClosedReason.AUTO_TIMEOUT) {
    return "AUTO_TIMEOUT";
  }
  if (reason === ClosedReason.USER_PHOTO) {
    return "USER_PHOTO";
  }
  return "";
};

const countViolations = (violations: ViolationType[]): {
  notClosedInTime: number;
  shortShift: number;
  total: number;
} => {
  let notClosedInTime = 0;
  let shortShift = 0;
  for (const violation of violations) {
    if (violation === ViolationType.NOT_CLOSED_IN_TIME) {
      notClosedInTime += 1;
    }
    if (violation === ViolationType.SHORT_SHIFT) {
      shortShift += 1;
    }
  }
  return { notClosedInTime, shortShift, total: violations.length };
};

export class ExportService {
  buildEmployeeReportCsv(report: EmployeeReport, tz: string): ExportFile {
    const header = [
      "employeeId",
      "telegramUserId",
      "displayName",
      "startTime",
      "endTime",
      "durationMinutes",
      "closedReason",
      "notClosedInTimeViolationsCount",
      "shortShiftViolationsCount",
      "totalViolationsCount",
      "violations"
    ];

    const rows = report.shifts.map((shift) => {
      const counts = countViolations(shift.violations);
      return [
        report.employeeId,
        report.telegramUserId,
        report.displayName,
        formatDateTime(shift.startTime, tz),
        shift.endTime ? formatDateTime(shift.endTime, tz) : "",
        shift.durationMinutes ?? "",
        mapClosedReason(shift.closedReason),
        counts.notClosedInTime,
        counts.shortShift,
        counts.total,
        shift.violations.join(",")
      ];
    });

    const content = [header, ...rows]
      .map((row) => row.map(escapeCsvValue).join(","))
      .join("\n");

    const filename = `report_${formatDateForFilename(report.period.from, tz)}_to_${formatDateForFilename(report.period.to, tz)}.csv`;

    return { filename, content: Buffer.from(content, "utf-8") };
  }

  buildAllEmployeesSummaryCsv(period: { from: Date; to: Date }, employees: EmployeeSummary[], tz: string): ExportFile {
    const header = [
      "employeeId",
      "telegramUserId",
      "displayName",
      "shiftsCount",
      "totalMinutes",
      "avgShiftMinutes",
      "notClosedInTimeViolationsCount",
      "shortShiftViolationsCount",
      "totalViolationsCount",
      "lastShiftStart",
      "lastShiftEnd",
      "lastShiftClosedReason"
    ];

    const rows = employees.map((employee) => [
      employee.employeeId,
      employee.telegramUserId,
      employee.displayName,
      employee.totalShifts,
      employee.totalDurationMinutes,
      employee.averageDurationMinutes,
      employee.violationsNotClosedInTime,
      employee.violationsShortShift,
      employee.violationsTotal,
      employee.lastShiftStart ? formatDateTime(employee.lastShiftStart, tz) : "",
      employee.lastShiftEnd ? formatDateTime(employee.lastShiftEnd, tz) : "",
      mapClosedReason(employee.lastShiftClosedReason ?? null)
    ]);

    const content = [header, ...rows]
      .map((row) => row.map(escapeCsvValue).join(","))
      .join("\n");

    const filename = `report_${formatDateForFilename(period.from, tz)}_to_${formatDateForFilename(period.to, tz)}.csv`;

    return { filename, content: Buffer.from(content, "utf-8") };
  }

  buildRawShiftsCsv(period: { from: Date; to: Date }, shifts: Array<{
    employeeId: number;
    telegramUserId: string;
    displayName: string;
    startTime: Date;
    endTime: Date | null;
    durationMinutes: number | null;
    closedReason: ClosedReason | null;
    violations: ViolationType[];
  }>, tz: string): ExportFile {
    const header = [
      "employeeId",
      "telegramUserId",
      "displayName",
      "startTime",
      "endTime",
      "durationMinutes",
      "closedReason",
      "notClosedInTimeViolationsCount",
      "shortShiftViolationsCount",
      "totalViolationsCount",
      "violations"
    ];

    const rows = shifts.map((shift) => {
      const counts = countViolations(shift.violations);
      return [
        shift.employeeId,
        shift.telegramUserId,
        shift.displayName,
        formatDateTime(shift.startTime, tz),
        shift.endTime ? formatDateTime(shift.endTime, tz) : "",
        shift.durationMinutes ?? "",
        mapClosedReason(shift.closedReason),
        counts.notClosedInTime,
        counts.shortShift,
        counts.total,
        shift.violations.join(",")
      ];
    });

    const content = [header, ...rows]
      .map((row) => row.map(escapeCsvValue).join(","))
      .join("\n");

    const filename = `report_raw_${formatDateForFilename(period.from, tz)}_to_${formatDateForFilename(period.to, tz)}.csv`;

    return { filename, content: Buffer.from(content, "utf-8") };
  }
}
