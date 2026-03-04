import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { ViolationType } from "@prisma/client";
import { ShiftRepository } from "../repositories/shiftRepository";

dayjs.extend(utc);
dayjs.extend(timezone);

export interface DigestRange {
  from: Date;
  to: Date;
}

export interface DailyDigestEmployee {
  employeeId: number;
  telegramUserId: string;
  displayName: string;
  shiftsCount: number;
  firstShiftStart: Date;
  lastShiftEnd: Date | null;
  totalDurationMinutes: number;
  violationsNotClosedInTime: number;
}

export interface WeeklyDigestEmployee {
  employeeId: number;
  telegramUserId: string;
  displayName: string;
  shiftsCount: number;
  totalDurationMinutes: number;
  violationsNotClosedInTime: number;
  lastShiftStart: Date;
  lastShiftEnd: Date | null;
}

export interface DailyDigestReport {
  type: "daily";
  timezone: string;
  dateKey: string;
  range: DigestRange;
  employees: DailyDigestEmployee[];
  totals: {
    totalEmployees: number;
    totalShifts: number;
    totalDurationMinutes: number;
    violationsNotClosedInTime: number;
    notClosedEmployees: number;
  };
}

export interface WeeklyDigestReport {
  type: "weekly";
  timezone: string;
  range: DigestRange & { days: number };
  employees: WeeklyDigestEmployee[];
  totals: {
    totalEmployees: number;
    totalShifts: number;
    totalDurationMinutes: number;
    violationsNotClosedInTime: number;
  };
}

type ShiftAccumulator = {
  employeeId: number;
  telegramUserId: string;
  displayName: string;
  shiftsCount: number;
  firstShiftStart: Date;
  lastShiftStart: Date;
  lastShiftEnd: Date | null;
  totalDurationMinutes: number;
  violationsNotClosedInTime: number;
};

export const parseDigestDateKey = (dateKey: string, timezoneName: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return null;
  }

  const parsed = dayjs.tz(`${dateKey}T00:00:00`, timezoneName);
  if (!parsed.isValid()) {
    return null;
  }
  if (parsed.format("YYYY-MM-DD") !== dateKey) {
    return null;
  }
  return parsed.toDate();
};

export class DigestService {
  constructor(private shiftRepo: ShiftRepository) {}

  buildDailyRange(params: { timezone: string; date?: Date; now?: Date }): DigestRange & { dateKey: string } {
    const current = params.date ?? params.now ?? new Date();
    const target = dayjs(current).tz(params.timezone);
    const fromTz = target.startOf("day");
    const toTz = target.endOf("day");
    return {
      from: fromTz.toDate(),
      to: toTz.toDate(),
      dateKey: fromTz.format("YYYY-MM-DD")
    };
  }

  buildWeeklyRange(params: { timezone: string; now?: Date; days?: number }): DigestRange & { days: number } {
    const now = params.now ?? new Date();
    const days = Math.max(1, Math.floor(params.days ?? 7));
    const nowTz = dayjs(now).tz(params.timezone);
    const fromTz = nowTz.startOf("day").subtract(days - 1, "day");
    return {
      from: fromTz.toDate(),
      to: now,
      days
    };
  }

  async getDailyDigestReport(params: {
    timezone: string;
    date?: Date;
    now?: Date;
  }): Promise<DailyDigestReport> {
    const dailyRange = this.buildDailyRange(params);
    const accumulators = await this.collectByEmployee(dailyRange.from, dailyRange.to);

    const employees: DailyDigestEmployee[] = accumulators.map((entry) => ({
      employeeId: entry.employeeId,
      telegramUserId: entry.telegramUserId,
      displayName: entry.displayName,
      shiftsCount: entry.shiftsCount,
      firstShiftStart: entry.firstShiftStart,
      lastShiftEnd: entry.lastShiftEnd,
      totalDurationMinutes: entry.totalDurationMinutes,
      violationsNotClosedInTime: entry.violationsNotClosedInTime
    }));

    const totals = {
      totalEmployees: employees.length,
      totalShifts: employees.reduce((sum, employee) => sum + employee.shiftsCount, 0),
      totalDurationMinutes: employees.reduce((sum, employee) => sum + employee.totalDurationMinutes, 0),
      violationsNotClosedInTime: employees.reduce((sum, employee) => sum + employee.violationsNotClosedInTime, 0),
      notClosedEmployees: employees.reduce((sum, employee) => sum + (employee.lastShiftEnd ? 0 : 1), 0)
    };

    return {
      type: "daily",
      timezone: params.timezone,
      dateKey: dailyRange.dateKey,
      range: {
        from: dailyRange.from,
        to: dailyRange.to
      },
      employees,
      totals
    };
  }

  async getWeeklyDigestReport(params: {
    timezone: string;
    now?: Date;
    days?: number;
  }): Promise<WeeklyDigestReport> {
    const weeklyRange = this.buildWeeklyRange(params);
    const accumulators = await this.collectByEmployee(weeklyRange.from, weeklyRange.to);

    const employees: WeeklyDigestEmployee[] = accumulators.map((entry) => ({
      employeeId: entry.employeeId,
      telegramUserId: entry.telegramUserId,
      displayName: entry.displayName,
      shiftsCount: entry.shiftsCount,
      totalDurationMinutes: entry.totalDurationMinutes,
      violationsNotClosedInTime: entry.violationsNotClosedInTime,
      lastShiftStart: entry.lastShiftStart,
      lastShiftEnd: entry.lastShiftEnd
    }));

    const totals = {
      totalEmployees: employees.length,
      totalShifts: employees.reduce((sum, employee) => sum + employee.shiftsCount, 0),
      totalDurationMinutes: employees.reduce((sum, employee) => sum + employee.totalDurationMinutes, 0),
      violationsNotClosedInTime: employees.reduce((sum, employee) => sum + employee.violationsNotClosedInTime, 0)
    };

    return {
      type: "weekly",
      timezone: params.timezone,
      range: weeklyRange,
      employees,
      totals
    };
  }

  private async collectByEmployee(from: Date, to: Date): Promise<ShiftAccumulator[]> {
    const shifts = await this.shiftRepo.findShiftsInRange(from, to, { order: "asc" });
    const byEmployee = new Map<number, ShiftAccumulator>();

    for (const shift of shifts) {
      const current = byEmployee.get(shift.employeeId);
      const notClosedViolationCount = shift.violations.reduce((sum, violation) => {
        return violation.type === ViolationType.NOT_CLOSED_IN_TIME ? sum + 1 : sum;
      }, 0);

      if (!current) {
        byEmployee.set(shift.employeeId, {
          employeeId: shift.employeeId,
          telegramUserId: shift.employee.telegramUserId,
          displayName: shift.employee.displayName,
          shiftsCount: 1,
          firstShiftStart: shift.startTime,
          lastShiftStart: shift.startTime,
          lastShiftEnd: shift.endTime,
          totalDurationMinutes: shift.durationMinutes ?? 0,
          violationsNotClosedInTime: notClosedViolationCount
        });
        continue;
      }

      current.shiftsCount += 1;
      current.totalDurationMinutes += shift.durationMinutes ?? 0;
      current.violationsNotClosedInTime += notClosedViolationCount;

      if (shift.startTime < current.firstShiftStart) {
        current.firstShiftStart = shift.startTime;
      }
      if (shift.startTime >= current.lastShiftStart) {
        current.lastShiftStart = shift.startTime;
        current.lastShiftEnd = shift.endTime;
      }
    }

    return Array.from(byEmployee.values()).sort((a, b) => {
      const byName = a.displayName.localeCompare(b.displayName, "ru");
      if (byName !== 0) {
        return byName;
      }
      return a.employeeId - b.employeeId;
    });
  }
}
