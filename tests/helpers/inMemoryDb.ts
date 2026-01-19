import {
  ClosedReason,
  EmployeeRoleOverride,
  PendingActionStatus,
  PendingActionType,
  UserMode,
  ViolationType
} from "@prisma/client";
import {
  EmployeeRecord,
  PendingActionRecord,
  ShiftRecord,
  ShiftViolationRecord,
  ShiftWithRelations,
  TelegramUserInput
} from "../../src/domain/types";
import { EmployeeRepository } from "../../src/repositories/employeeRepository";
import { ShiftRepository } from "../../src/repositories/shiftRepository";
import { AdminRepository } from "../../src/repositories/adminRepository";
import { UserSessionRepository } from "../../src/repositories/userSessionRepository";
import { PendingActionRepository } from "../../src/repositories/pendingActionRepository";

export class InMemoryDatabase {
  employees: EmployeeRecord[] = [];
  shifts: ShiftRecord[] = [];
  violations: ShiftViolationRecord[] = [];
  pendingActions: PendingActionRecord[] = [];
  admins = new Set<string>();
  sessions: { telegramUserId: string; mode: UserMode }[] = [];
  nextEmployeeId = 1;
  nextShiftId = 1;
  nextViolationId = 1;
  nextPendingId = 1;
}

export class InMemoryEmployeeRepository implements EmployeeRepository {
  constructor(private db: InMemoryDatabase) {}

  async upsertFromTelegram(user: TelegramUserInput): Promise<EmployeeRecord> {
    const existing = this.db.employees.find(
      (employee) => employee.telegramUserId === String(user.id)
    );
    const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ")
      || (user.username ? `@${user.username}` : `user:${user.id}`);

    if (existing) {
      existing.username = user.username ?? null;
      existing.firstName = user.firstName ?? null;
      existing.lastName = user.lastName ?? null;
      existing.displayName = displayName;
      return existing;
    }

    const record: EmployeeRecord = {
      id: this.db.nextEmployeeId++,
      telegramUserId: String(user.id),
      username: user.username ?? null,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      displayName,
      isActive: true,
      roleOverride: EmployeeRoleOverride.DEFAULT
    };
    this.db.employees.push(record);
    return record;
  }

  async findByTelegramUserId(telegramUserId: string): Promise<EmployeeRecord | null> {
    return this.db.employees.find((employee) => employee.telegramUserId === telegramUserId) ?? null;
  }

  async findById(id: number): Promise<EmployeeRecord | null> {
    return this.db.employees.find((employee) => employee.id === id) ?? null;
  }

  async findByIds(ids: number[]): Promise<EmployeeRecord[]> {
    return this.db.employees.filter((employee) => ids.includes(employee.id));
  }

  async listEmployees(params: { page: number; pageSize: number; query?: string }): Promise<{
    items: EmployeeRecord[];
    total: number;
  }> {
    const query = params.query?.toLowerCase().trim();
    const filtered = query
      ? this.db.employees.filter((employee) => {
          const haystack = [
            employee.displayName,
            employee.username ?? "",
            employee.firstName ?? "",
            employee.lastName ?? "",
            employee.telegramUserId
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(query);
        })
      : this.db.employees;

    const page = Math.max(1, params.page);
    const pageSize = Math.max(1, params.pageSize);
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);
    return { items, total: filtered.length };
  }
}

export class InMemoryAdminRepository implements AdminRepository {
  constructor(private db: InMemoryDatabase) {}

  async isAdminUserId(userId: string): Promise<boolean> {
    return this.db.admins.has(userId);
  }

  async countAdmins(): Promise<number> {
    return this.db.admins.size;
  }

  async addAdminUserId(userId: string): Promise<void> {
    this.db.admins.add(userId);
  }

  async getAdminUserIds(): Promise<string[]> {
    return Array.from(this.db.admins);
  }
}

export class InMemoryUserSessionRepository implements UserSessionRepository {
  constructor(private db: InMemoryDatabase) {}

  async getSession(userId: string): Promise<{ telegramUserId: string; mode: UserMode } | null> {
    return this.db.sessions.find((session) => session.telegramUserId === userId) ?? null;
  }

  async setSession(userId: string, mode: UserMode): Promise<void> {
    const existing = this.db.sessions.find((session) => session.telegramUserId === userId);
    if (existing) {
      existing.mode = mode;
      return;
    }
    this.db.sessions.push({ telegramUserId: userId, mode });
  }
}

export class InMemoryShiftRepository implements ShiftRepository {
  constructor(private db: InMemoryDatabase) {}

  async findOpenShift(employeeId: number, _tx?: unknown): Promise<ShiftRecord | null> {
    return this.db.shifts
      .filter((shift) => shift.employeeId === employeeId && shift.endTime === null)
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())[0] ?? null;
  }

  async findLastShift(employeeId: number): Promise<ShiftRecord | null> {
    return this.db.shifts
      .filter((shift) => shift.employeeId === employeeId)
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())[0] ?? null;
  }

  async isMessageProcessed(chatId: string, messageId: number): Promise<boolean> {
    return this.db.shifts.some(
      (shift) =>
        (shift.startChatId === chatId && shift.startMessageId === messageId)
        || (shift.endChatId === chatId && shift.endMessageId === messageId)
    );
  }

  async createShiftStart(data: {
    employeeId: number;
    startTime: Date;
    startPhotoFileId: string;
    startMessageId: number;
    startChatId: string;
  }, _tx?: unknown): Promise<ShiftRecord> {
    const record: ShiftRecord = {
      id: this.db.nextShiftId++,
      employeeId: data.employeeId,
      startTime: data.startTime,
      endTime: null,
      startPhotoFileId: data.startPhotoFileId,
      endPhotoFileId: null,
      startMessageId: data.startMessageId,
      startChatId: data.startChatId,
      employeeChatId: data.startChatId,
      endMessageId: null,
      endChatId: null,
      closedReason: null,
      autoClosedAt: null,
      alertedAt: null,
      durationMinutes: null,
      photosPurgedAt: null
    };
    this.db.shifts.push(record);
    return record;
  }

  async closeShiftByUserPhoto(data: {
    shiftId: number;
    endTime: Date;
    endPhotoFileId: string;
    endMessageId: number;
    endChatId: string;
    durationMinutes: number;
  }, _tx?: unknown): Promise<ShiftRecord> {
    const shift = this.db.shifts.find((item) => item.id === data.shiftId);
    if (!shift) {
      throw new Error("Shift not found");
    }
    shift.endTime = data.endTime;
    shift.endPhotoFileId = data.endPhotoFileId;
    shift.endMessageId = data.endMessageId;
    shift.endChatId = data.endChatId;
    shift.closedReason = ClosedReason.USER_PHOTO;
    shift.durationMinutes = data.durationMinutes;
    return shift;
  }

  async createViolation(shiftId: number, type: ViolationType, _tx?: unknown): Promise<void> {
    const existing = this.db.violations.find(
      (violation) => violation.shiftId === shiftId && violation.type === type
    );
    if (existing) {
      return;
    }
    this.db.violations.push({
      id: this.db.nextViolationId++,
      shiftId,
      type,
      createdAt: new Date()
    });
  }

  async findOverdueShifts(cutoff: Date, take?: number): Promise<ShiftWithRelations[]> {
    const matches = this.db.shifts
      .filter((shift) => shift.endTime === null && shift.alertedAt === null && shift.startTime <= cutoff)
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    const limited = take ? matches.slice(0, take) : matches;
    return limited.map((shift) => this.attachRelations(shift));
  }

  async autoCloseShift(
    shiftId: number,
    endTime: Date,
    durationMinutes: number,
    now: Date,
    _tx?: unknown
  ): Promise<ShiftWithRelations | null> {
    const shift = this.db.shifts.find((item) => item.id === shiftId);
    if (!shift || shift.endTime !== null || shift.alertedAt !== null) {
      return null;
    }

    shift.endTime = endTime;
    shift.closedReason = ClosedReason.AUTO_TIMEOUT;
    shift.durationMinutes = durationMinutes;
    shift.autoClosedAt = now;
    shift.alertedAt = now;

    const existingViolation = this.db.violations.find(
      (violation) => violation.shiftId === shiftId && violation.type === ViolationType.NOT_CLOSED_IN_TIME
    );

    if (!existingViolation) {
      this.db.violations.push({
        id: this.db.nextViolationId++,
        shiftId,
        type: ViolationType.NOT_CLOSED_IN_TIME,
        createdAt: now
      });
    }

    return this.attachRelations(shift);
  }

  async findShiftsInRange(
    from: Date,
    to: Date,
    options?: { limit?: number; order?: "asc" | "desc" }
  ): Promise<ShiftWithRelations[]> {
    const ordered = this.db.shifts
      .filter((shift) => shift.startTime >= from && shift.startTime <= to)
      .sort((a, b) => {
        const primary = a.employeeId - b.employeeId;
        if (primary !== 0) {
          return primary;
        }
        return (options?.order ?? "asc") === "asc"
          ? a.startTime.getTime() - b.startTime.getTime()
          : b.startTime.getTime() - a.startTime.getTime();
      });
    const limited = options?.limit ? ordered.slice(0, options.limit) : ordered;
    return limited.map((shift) => this.attachRelations(shift));
  }

  async findEmployeeShiftsInRange(employeeId: number, from: Date, to: Date, limit: number): Promise<ShiftWithRelations[]> {
    return this.db.shifts
      .filter((shift) => shift.employeeId === employeeId && shift.startTime >= from && shift.startTime <= to)
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .slice(0, limit)
      .map((shift) => this.attachRelations(shift));
  }

  async findShiftById(shiftId: number): Promise<ShiftWithRelations | null> {
    const shift = this.db.shifts.find((item) => item.id === shiftId);
    return shift ? this.attachRelations(shift) : null;
  }

  async purgeOldPhotos(cutoff: Date, now: Date, take?: number): Promise<number> {
    let count = 0;
    for (const shift of this.db.shifts) {
      if (take && count >= take) {
        break;
      }
      if (shift.startTime < cutoff && shift.photosPurgedAt === null) {
        shift.startPhotoFileId = null;
        shift.endPhotoFileId = null;
        shift.photosPurgedAt = now;
        count += 1;
      }
    }
    return count;
  }

  async aggregateEmployeeStats(employeeId: number, from: Date, to: Date): Promise<{
    totalShifts: number;
    totalDurationMinutes: number;
    averageDurationMinutes: number;
  }> {
    const shifts = this.db.shifts.filter(
      (shift) => shift.employeeId === employeeId && shift.startTime >= from && shift.startTime <= to
    );
    const totalShifts = shifts.length;
    const totalDurationMinutes = shifts.reduce((sum, shift) => sum + (shift.durationMinutes ?? 0), 0);
    const averageDurationMinutes = totalShifts > 0 ? Math.round(totalDurationMinutes / totalShifts) : 0;
    return { totalShifts, totalDurationMinutes, averageDurationMinutes };
  }

  async countEmployeeViolations(employeeId: number, from: Date, to: Date): Promise<number> {
    const shiftIds = new Set(
      this.db.shifts
        .filter((shift) => shift.employeeId === employeeId && shift.startTime >= from && shift.startTime <= to)
        .map((shift) => shift.id)
    );
    return this.db.violations.filter((violation) => shiftIds.has(violation.shiftId)).length;
  }

  async countEmployeeViolationsByType(employeeId: number, from: Date, to: Date): Promise<{
    notClosedInTime: number;
    shortShift: number;
    total: number;
  }> {
    const shiftIds = new Set(
      this.db.shifts
        .filter((shift) => shift.employeeId === employeeId && shift.startTime >= from && shift.startTime <= to)
        .map((shift) => shift.id)
    );
    let notClosedInTime = 0;
    let shortShift = 0;
    let total = 0;

    for (const violation of this.db.violations) {
      if (!shiftIds.has(violation.shiftId)) {
        continue;
      }
      total += 1;
      if (violation.type === ViolationType.NOT_CLOSED_IN_TIME) {
        notClosedInTime += 1;
      }
      if (violation.type === ViolationType.SHORT_SHIFT) {
        shortShift += 1;
      }
    }

    return { notClosedInTime, shortShift, total };
  }

  async groupByEmployeeStats(from: Date, to: Date): Promise<Array<{
    employeeId: number;
    totalShifts: number;
    totalDurationMinutes: number;
    averageDurationMinutes: number;
  }>> {
    const grouped = new Map<number, ShiftRecord[]>();
    for (const shift of this.db.shifts) {
      if (shift.startTime < from || shift.startTime > to) {
        continue;
      }
      const list = grouped.get(shift.employeeId) ?? [];
      list.push(shift);
      grouped.set(shift.employeeId, list);
    }

    return Array.from(grouped.entries()).map(([employeeId, shifts]) => {
      const totalShifts = shifts.length;
      const totalDurationMinutes = shifts.reduce((sum, shift) => sum + (shift.durationMinutes ?? 0), 0);
      const averageDurationMinutes = totalShifts > 0 ? Math.round(totalDurationMinutes / totalShifts) : 0;
      return { employeeId, totalShifts, totalDurationMinutes, averageDurationMinutes };
    });
  }

  async countViolationsByEmployee(from: Date, to: Date): Promise<Array<{ employeeId: number; violations: number }>> {
    const violations = new Map<number, number>();
    for (const violation of this.db.violations) {
      const shift = this.db.shifts.find((item) => item.id === violation.shiftId);
      if (!shift || shift.startTime < from || shift.startTime > to) {
        continue;
      }
      violations.set(shift.employeeId, (violations.get(shift.employeeId) ?? 0) + 1);
    }
    return Array.from(violations.entries()).map(([employeeId, count]) => ({
      employeeId,
      violations: count
    }));
  }

  async countViolationsByEmployeeAndType(
    from: Date,
    to: Date
  ): Promise<Array<{ employeeId: number; type: ViolationType; count: number }>> {
    const counts = new Map<string, number>();
    for (const violation of this.db.violations) {
      const shift = this.db.shifts.find((item) => item.id === violation.shiftId);
      if (!shift || shift.startTime < from || shift.startTime > to) {
        continue;
      }
      const key = `${shift.employeeId}:${violation.type}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([key, count]) => {
      const [employeeId, type] = key.split(":");
      return { employeeId: Number(employeeId), type: type as ViolationType, count };
    });
  }

  async findLastShiftsByEmployee(from: Date, to: Date): Promise<Array<{
    employeeId: number;
    startTime: Date;
    endTime: Date | null;
    closedReason: ClosedReason | null;
  }>> {
    const byEmployee = new Map<number, ShiftRecord>();
    for (const shift of this.db.shifts) {
      if (shift.startTime < from || shift.startTime > to) {
        continue;
      }
      const existing = byEmployee.get(shift.employeeId);
      if (!existing || shift.startTime > existing.startTime) {
        byEmployee.set(shift.employeeId, shift);
      }
    }
    return Array.from(byEmployee.entries()).map(([employeeId, shift]) => ({
      employeeId,
      startTime: shift.startTime,
      endTime: shift.endTime,
      closedReason: shift.closedReason
    }));
  }

  private attachRelations(shift: ShiftRecord): ShiftWithRelations {
    const employee = this.db.employees.find((item) => item.id === shift.employeeId);
    if (!employee) {
      throw new Error("Employee not found");
    }
    const violations = this.db.violations.filter((item) => item.shiftId === shift.id);
    return {
      ...shift,
      employee,
      violations
    };
  }
}

export class InMemoryPendingActionRepository implements PendingActionRepository {
  constructor(private db: InMemoryDatabase) {}

  async findById(id: number, _tx?: unknown): Promise<PendingActionRecord | null> {
    return this.db.pendingActions.find((item) => item.id === id) ?? null;
  }

  async findByChatMessage(chatId: string, messageId: number, _tx?: unknown): Promise<PendingActionRecord | null> {
    return this.db.pendingActions.find(
      (item) => item.chatId === chatId && item.photoMessageId === messageId
    ) ?? null;
  }

  async createPendingAction(data: {
    employeeId: number;
    telegramUserId: string;
    chatId: string;
    actionType: PendingActionType;
    photoFileId: string;
    photoMessageId: number;
    createdAt: Date;
    expiresAt: Date;
  }, _tx?: unknown): Promise<PendingActionRecord> {
    const record: PendingActionRecord = {
      id: this.db.nextPendingId++,
      employeeId: data.employeeId,
      telegramUserId: data.telegramUserId,
      chatId: data.chatId,
      actionType: data.actionType,
      photoFileId: data.photoFileId,
      photoMessageId: data.photoMessageId,
      createdAt: data.createdAt,
      expiresAt: data.expiresAt,
      status: PendingActionStatus.PENDING,
      updatedAt: data.createdAt
    };
    this.db.pendingActions.push(record);
    return record;
  }

  async updateStatus(id: number, status: PendingActionStatus, now: Date, _tx?: unknown): Promise<PendingActionRecord | null> {
    const record = this.db.pendingActions.find((item) => item.id === id);
    if (!record) {
      return null;
    }
    record.status = status;
    record.updatedAt = now;
    return record;
  }

  async updateStatusIfPending(id: number, now: Date, status: PendingActionStatus, _tx?: unknown): Promise<number> {
    const record = this.db.pendingActions.find((item) => item.id === id);
    if (!record) {
      return 0;
    }
    if (record.status !== PendingActionStatus.PENDING || record.expiresAt <= now) {
      return 0;
    }
    record.status = status;
    record.updatedAt = now;
    return 1;
  }

  async expirePendingActions(now: Date, limit?: number): Promise<number> {
    let count = 0;
    for (const record of this.db.pendingActions) {
      if (limit && count >= limit) {
        break;
      }
      if (record.status === PendingActionStatus.PENDING && record.expiresAt <= now) {
        record.status = PendingActionStatus.EXPIRED;
        record.updatedAt = now;
        count += 1;
      }
    }
    return count;
  }
}
