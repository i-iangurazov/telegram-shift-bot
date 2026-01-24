import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { ClosedReason, ViolationType } from "@prisma/client";
import { ShiftRepository } from "../repositories/shiftRepository";

dayjs.extend(utc);
dayjs.extend(timezone);

export type PhotoRangeKey = "today" | "yesterday" | "last3";

export interface PhotoRange {
  key: PhotoRangeKey;
  from: Date;
  to: Date;
  label: string;
}

export interface PhotoShiftSummary {
  id: number;
  startTime: Date;
  endTime: Date | null;
  closedReason: ClosedReason | null;
  violations: ViolationType[];
}

export class PhotoReviewService {
  constructor(private shiftRepo: ShiftRepository) {}

  buildRange(key: PhotoRangeKey, tz: string, now: Date = new Date()): PhotoRange {
    const nowTz = dayjs(now).tz(tz);

    if (key === "today") {
      return {
        key,
        from: nowTz.startOf("day").toDate(),
        to: now,
        label: "Сегодня"
      };
    }

    if (key === "yesterday") {
      const start = nowTz.subtract(1, "day").startOf("day");
      const end = nowTz.startOf("day");
      return {
        key,
        from: start.toDate(),
        to: end.toDate(),
        label: "Вчера"
      };
    }

    return {
      key,
      from: nowTz.subtract(3, "day").toDate(),
      to: now,
      label: "Последние 3 дня"
    };
  }

  async listEmployeeShifts(employeeId: number, range: PhotoRange, limit: number): Promise<PhotoShiftSummary[]> {
    const shifts = await this.shiftRepo.findEmployeeShiftsInRange(employeeId, range.from, range.to, { limit });
    return shifts.map((shift) => ({
      id: shift.id,
      startTime: shift.startTime,
      endTime: shift.endTime,
      closedReason: shift.closedReason,
      violations: shift.violations.map((violation) => violation.type)
    }));
  }

  async getShiftDetails(shiftId: number) {
    return this.shiftRepo.findShiftById(shiftId);
  }
}
