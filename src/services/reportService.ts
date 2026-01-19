import { ClosedReason, ViolationType } from "@prisma/client";
import { ShiftRepository } from "../repositories/shiftRepository";
import { EmployeeRepository } from "../repositories/employeeRepository";

export interface PeriodRange {
  from: Date;
  to: Date;
  days: number;
}

export interface EmployeeShiftRow {
  startTime: Date;
  endTime: Date | null;
  durationMinutes: number | null;
  closedReason: ClosedReason | null;
  violations: ViolationType[];
}

export interface EmployeeReport {
  employeeId: number;
  telegramUserId: string;
  displayName: string;
  period: PeriodRange;
  totalShifts: number;
  totalDurationMinutes: number;
  averageDurationMinutes: number;
  violationsNotClosedInTime: number;
  violationsShortShift: number;
  violationsTotal: number;
  shifts: EmployeeShiftRow[];
}

export interface EmployeeSummary {
  employeeId: number;
  telegramUserId: string;
  displayName: string;
  totalShifts: number;
  totalDurationMinutes: number;
  averageDurationMinutes: number;
  violationsNotClosedInTime: number;
  violationsShortShift: number;
  violationsTotal: number;
  lastShiftStart?: Date | null;
  lastShiftEnd?: Date | null;
  lastShiftClosedReason?: ClosedReason | null;
}

export interface AllEmployeesReport {
  period: PeriodRange;
  totalEmployees: number;
  totalShifts: number;
  totalDurationMinutes: number;
  violationsNotClosedInTime: number;
  violationsShortShift: number;
  totalViolations: number;
  employees: EmployeeSummary[];
  topEmployees: EmployeeSummary[];
}

export class ReportService {
  constructor(
    private shiftRepo: ShiftRepository,
    private employeeRepo: EmployeeRepository
  ) {}

  buildRange(days: number, now: Date = new Date()): PeriodRange {
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return { from, to: now, days };
  }

  async getEmployeeReport(employeeId: number, days: number, now: Date = new Date()): Promise<EmployeeReport | null> {
    const period = this.buildRange(days, now);
    const employee = await this.employeeRepo.findById(employeeId);
    if (!employee) {
      return null;
    }

    const stats = await this.shiftRepo.aggregateEmployeeStats(employeeId, period.from, period.to);
    const violationCounts = await this.shiftRepo.countEmployeeViolationsByType(employeeId, period.from, period.to);
    const shifts = await this.shiftRepo.findEmployeeShiftsInRange(employeeId, period.from, period.to, 10);

    const shiftRows: EmployeeShiftRow[] = shifts.map((shift) => ({
      startTime: shift.startTime,
      endTime: shift.endTime,
      durationMinutes: shift.durationMinutes,
      closedReason: shift.closedReason,
      violations: shift.violations.map((violation) => violation.type)
    }));

    return {
      employeeId: employee.id,
      telegramUserId: employee.telegramUserId,
      displayName: employee.displayName,
      period,
      totalShifts: stats.totalShifts,
      totalDurationMinutes: stats.totalDurationMinutes,
      averageDurationMinutes: stats.averageDurationMinutes,
      violationsNotClosedInTime: violationCounts.notClosedInTime,
      violationsShortShift: violationCounts.shortShift,
      violationsTotal: violationCounts.total,
      shifts: shiftRows
    };
  }

  async getAllEmployeesReport(days: number, now: Date = new Date()): Promise<AllEmployeesReport> {
    const period = this.buildRange(days, now);
    const stats = await this.shiftRepo.groupByEmployeeStats(period.from, period.to);
    const violationsByType = await this.shiftRepo.countViolationsByEmployeeAndType(period.from, period.to);
    const lastShifts = await this.shiftRepo.findLastShiftsByEmployee(period.from, period.to);

    const employees = await this.employeeRepo.findByIds(stats.map((item) => item.employeeId));
    const byEmployeeId = new Map<number, { telegramUserId: string; displayName: string }>();
    for (const employee of employees) {
      byEmployeeId.set(employee.id, {
        telegramUserId: employee.telegramUserId,
        displayName: employee.displayName
      });
    }

    const violationsMap = new Map<number, { notClosedInTime: number; shortShift: number; total: number }>();
    for (const row of violationsByType) {
      const current = violationsMap.get(row.employeeId) ?? { notClosedInTime: 0, shortShift: 0, total: 0 };
      if (row.type === ViolationType.NOT_CLOSED_IN_TIME) {
        current.notClosedInTime = row.count;
      }
      if (row.type === ViolationType.SHORT_SHIFT) {
        current.shortShift = row.count;
      }
      current.total += row.count;
      violationsMap.set(row.employeeId, current);
    }

    const lastShiftMap = new Map<number, { startTime: Date; endTime: Date | null; closedReason: ClosedReason | null }>();
    for (const row of lastShifts) {
      lastShiftMap.set(row.employeeId, {
        startTime: row.startTime,
        endTime: row.endTime,
        closedReason: row.closedReason
      });
    }

    const summaries: EmployeeSummary[] = stats.map((row) => {
      const employeeInfo = byEmployeeId.get(row.employeeId) ?? {
        telegramUserId: String(row.employeeId),
        displayName: `user:${row.employeeId}`
      };
      const lastShift = lastShiftMap.get(row.employeeId);
      const violations = violationsMap.get(row.employeeId) ?? { notClosedInTime: 0, shortShift: 0, total: 0 };
      return {
        employeeId: row.employeeId,
        telegramUserId: employeeInfo.telegramUserId,
        displayName: employeeInfo.displayName,
        totalShifts: row.totalShifts,
        totalDurationMinutes: row.totalDurationMinutes,
        averageDurationMinutes: row.averageDurationMinutes,
        violationsNotClosedInTime: violations.notClosedInTime,
        violationsShortShift: violations.shortShift,
        violationsTotal: violations.total,
        lastShiftStart: lastShift?.startTime ?? null,
        lastShiftEnd: lastShift?.endTime ?? null,
        lastShiftClosedReason: lastShift?.closedReason ?? null
      };
    });

    summaries.sort((a, b) => a.displayName.localeCompare(b.displayName, "ru"));

    const topEmployees = [...summaries].sort((a, b) => {
      if (b.violationsTotal !== a.violationsTotal) {
        return b.violationsTotal - a.violationsTotal;
      }
      return b.totalDurationMinutes - a.totalDurationMinutes;
    });

    const totalEmployees = summaries.length;
    const totalShifts = summaries.reduce((sum, item) => sum + item.totalShifts, 0);
    const totalDurationMinutes = summaries.reduce((sum, item) => sum + item.totalDurationMinutes, 0);
    const violationsNotClosedInTime = summaries.reduce((sum, item) => sum + item.violationsNotClosedInTime, 0);
    const violationsShortShift = summaries.reduce((sum, item) => sum + item.violationsShortShift, 0);
    const totalViolations = summaries.reduce((sum, item) => sum + item.violationsTotal, 0);

    return {
      period,
      totalEmployees,
      totalShifts,
      totalDurationMinutes,
      violationsNotClosedInTime,
      violationsShortShift,
      totalViolations,
      employees: summaries,
      topEmployees: topEmployees.slice(0, 10)
    };
  }

  async getEmployeeShiftsForExport(employeeId: number, days: number, now: Date = new Date()): Promise<EmployeeShiftRow[]> {
    const period = this.buildRange(days, now);
    const shifts = await this.shiftRepo.findEmployeeShiftsInRange(employeeId, period.from, period.to, 10000);
    return shifts.map((shift) => ({
      startTime: shift.startTime,
      endTime: shift.endTime,
      durationMinutes: shift.durationMinutes,
      closedReason: shift.closedReason,
      violations: shift.violations.map((violation) => violation.type)
    }));
  }

  async getRawShiftsForExport(days: number, now: Date = new Date(), limit = 5000): Promise<{
    period: PeriodRange;
    shifts: Array<{
      employeeId: number;
      telegramUserId: string;
      displayName: string;
      startTime: Date;
      endTime: Date | null;
      durationMinutes: number | null;
      closedReason: ClosedReason | null;
      violations: ViolationType[];
    }>;
  }> {
    const period = this.buildRange(days, now);
    const shifts = await this.shiftRepo.findShiftsInRange(period.from, period.to, { limit, order: "asc" });
    return {
      period,
      shifts: shifts.map((shift) => ({
        employeeId: shift.employeeId,
        telegramUserId: shift.employee.telegramUserId,
        displayName: shift.employee.displayName,
        startTime: shift.startTime,
        endTime: shift.endTime,
        durationMinutes: shift.durationMinutes,
        closedReason: shift.closedReason,
        violations: shift.violations.map((violation) => violation.type)
      }))
    };
  }
}
