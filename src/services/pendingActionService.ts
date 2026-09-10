import { table } from "../db/table";
import { updateReceivedAt } from "../server/updateContext";
import { ClosedReason, PendingActionStatus, PendingActionType, type Prisma } from "@prisma/client";
import { EmployeeRepository } from "../repositories/employeeRepository";
import { ShiftRepository } from "../repositories/shiftRepository";
import { PendingActionRepository } from "../repositories/pendingActionRepository";
import { EmployeeRecord, PendingActionRecord, ShiftRecord, ShiftWithRelations } from "../domain/types";
import { Clock, systemClock } from "../server/clock";
import { getDailyCloseEndTimeForShift, isDailyCloseDue } from "../utils/time";

type DbClient = Prisma.TransactionClient;
type TransactionRunner = <T>(fn: (tx?: DbClient) => Promise<T>) => Promise<T>;

export interface PendingActionConfig {
  ttlMinutes: number;
  maxShiftHours: number;
  minShiftMinutes: number;
  shortShiftGraceMinutes: number;
  profile?: "standard" | "start_only_daily_close";
  dailyAutoClose?: {
    closeTime: string;
    timezone: string;
  };
}

export type PendingActionCreateResult =
  | { type: "duplicate" }
  | { type: "stale_photo" }
  | { type: "open_shift_exists"; employee: EmployeeRecord }
  | { type: "pending"; pendingAction: PendingActionRecord; actionType: PendingActionType; employee: EmployeeRecord };

export type PendingActionConfirmResult =
  | { type: "confirmed_start"; shift: ShiftRecord; employee: EmployeeRecord; autoClose?: ShiftWithRelations | null }
  | { type: "confirmed_end"; shift: ShiftRecord; employee: EmployeeRecord; durationMinutes: number }
  | { type: "auto_closed"; autoClose: ShiftWithRelations }
  | { type: "no_open_shift" }
  | { type: "open_shift_exists" }
  | { type: "expired" }
  | { type: "not_found" }
  | { type: "forbidden" }
  | { type: "already_handled"; status: PendingActionStatus };

export type PendingActionCancelResult =
  | { type: "cancelled" }
  | { type: "expired" }
  | { type: "not_found" }
  | { type: "forbidden" }
  | { type: "already_handled"; status: PendingActionStatus };

export class PendingActionService {
  private clock: Clock;

  constructor(
    private employeeRepo: EmployeeRepository,
    private shiftRepo: ShiftRepository,
    private pendingRepo: PendingActionRepository,
    private config: PendingActionConfig,
    private runInTransaction: TransactionRunner,
    clock: Clock = systemClock
  ) {
    this.clock = clock;
  }

  async createFromPhoto(params: {
    user: { id: number; username?: string; firstName?: string; lastName?: string; chatId: number };
    messageId: number;
    chatId: number;
    fileId: string;
    messageDate: Date;
    receivedAt?: Date;
  }): Promise<PendingActionCreateResult> {
    const chatId = String(params.chatId);
    const alreadyProcessed = await this.shiftRepo.isMessageProcessed(chatId, params.messageId);
    if (alreadyProcessed) {
      return { type: "duplicate" };
    }

    const existingPending = await this.pendingRepo.findByChatMessage(chatId, params.messageId);
    if (existingPending) {
      if (existingPending.promptMessageId == null) {
        const refreshed = await this.pendingRepo.refreshUndeliveredPrompt(existingPending.id,
          new Date(this.clock.now().getTime() + this.config.ttlMinutes * 60000));
        const employee = refreshed ? await this.employeeRepo.findById(refreshed.employeeId) : null;
        if (refreshed && employee) return { type: "pending", pendingAction: refreshed, actionType: refreshed.actionType, employee };
      }
      return { type: "duplicate" };
    }

    const employee = await this.employeeRepo.upsertFromTelegram(params.user);
    if (!Number.isFinite(params.messageDate.getTime())) throw new Error("Некорректное время фотографии");
    let openShift = await this.shiftRepo.findOpenShift(employee.id);
    const lastShift = await this.shiftRepo.findLastShift(employee.id);
    if (lastShift && lastShift.startTime > params.messageDate) {
      const historical = await this.shiftRepo.findShiftAt(employee.id, params.messageDate);
      if (historical && (!historical.endTime || (historical.closedReason === ClosedReason.AUTO_TIMEOUT && params.messageDate < historical.endTime))) {
        openShift = historical;
      } else return { type: "stale_photo" };
    }
    if (!openShift && lastShift?.endTime && params.messageDate < lastShift.endTime) {
      if (lastShift.closedReason === ClosedReason.AUTO_TIMEOUT || lastShift.closedReason === ClosedReason.AUTO_DAILY) openShift = lastShift;
      else return { type: "stale_photo" };
    }

    if (this.isStartOnlyDailyClose() && openShift) {
      if (!this.isDailyCloseDue(openShift, params.messageDate)) {
        return { type: "open_shift_exists", employee };
      }
    }

    const maxShiftMs = this.config.maxShiftHours * 60 * 60 * 1000;
    const isOverdue = openShift
      ? this.isStartOnlyDailyClose()
        ? this.isDailyCloseDue(openShift, params.messageDate)
        : params.messageDate.getTime() >= openShift.startTime.getTime() + maxShiftMs
      : false;
    const actionType = !openShift || isOverdue ? PendingActionType.START : PendingActionType.END;

    const createdAt = params.messageDate;
    // The ten-minute confirmation window starts when we can present the prompt.
    // Keep the source photo timestamp separate and immutable.
    const promptedAt = params.receivedAt ?? this.clock.now();
    const expiresAt = new Date(promptedAt.getTime() + this.config.ttlMinutes * 60 * 1000);

    const pendingAction = await this.pendingRepo.createPendingAction({
      employeeId: employee.id,
      telegramUserId: employee.telegramUserId,
      chatId,
      actionType,
      photoFileId: params.fileId,
      photoMessageId: params.messageId,
      targetShiftId: actionType === PendingActionType.END ? openShift?.id : null,
      createdAt,
      expiresAt
    });

    return { type: "pending", pendingAction, actionType, employee };
  }

  async markPromptDelivered(id: number, messageId: number): Promise<void> {
    await this.pendingRepo.markPromptDelivered(id, messageId);
  }

  async confirmAction(id: number, userId: string, now: Date = updateReceivedAt() ?? this.clock.now()): Promise<PendingActionConfirmResult> {
    return this.runInTransaction(async (tx) => {
      const pending = await this.pendingRepo.findById(id, tx);
      if (!pending) {
        return { type: "not_found" };
      }

      if (pending.telegramUserId !== userId) {
        return { type: "forbidden" };
      }

      if (tx) await tx.$queryRaw`SELECT id FROM ${table("Employee")} WHERE id = ${pending.employeeId} FOR UPDATE`;
      if (pending.status !== PendingActionStatus.PENDING && !(pending.status === PendingActionStatus.EXPIRED && now < pending.expiresAt)) {
        return { type: "already_handled", status: pending.status };
      }

      if (pending.expiresAt <= now) {
        await this.pendingRepo.updateStatus(pending.id, PendingActionStatus.EXPIRED, now, tx);
        return { type: "expired" };
      }

      const locked = await this.pendingRepo.updateStatusIfPending(pending.id, now, PendingActionStatus.CONFIRMED, tx);
      if (locked === 0) {
        const refreshed = await this.pendingRepo.findById(pending.id, tx);
        if (refreshed && refreshed.status === PendingActionStatus.PENDING && refreshed.expiresAt <= now) {
          await this.pendingRepo.updateStatus(refreshed.id, PendingActionStatus.EXPIRED, now, tx);
          return { type: "expired" };
        }
        return refreshed
          ? { type: "already_handled", status: refreshed.status }
          : { type: "not_found" };
      }

      const employee = await this.employeeRepo.findById(pending.employeeId);
      if (!employee) {
        await this.pendingRepo.updateStatus(pending.id, PendingActionStatus.CANCELLED, now, tx);
        return { type: "not_found" };
      }

      const messageTime = pending.createdAt;
      const processedAt = this.clock.now();
      const maxShiftMs = this.config.maxShiftHours * 60 * 60 * 1000;

      if (pending.actionType === PendingActionType.START) {
        const latestShift = await this.shiftRepo.findLastShift(employee.id, tx);
        if (latestShift && (latestShift.startTime > messageTime || (latestShift.endTime && latestShift.endTime > messageTime))) {
          await this.pendingRepo.updateStatus(pending.id, PendingActionStatus.CANCELLED, now, tx);
          return { type: "open_shift_exists" };
        }
        const openShift = await this.shiftRepo.findOpenShift(employee.id, tx);
        let autoClosed: ShiftWithRelations | null = null;
        if (openShift) {
          const overdue = this.isStartOnlyDailyClose()
            ? this.isDailyCloseDue(openShift, messageTime)
            : messageTime.getTime() >= openShift.startTime.getTime() + maxShiftMs;
          if (!overdue) {
            await this.pendingRepo.updateStatus(pending.id, PendingActionStatus.CANCELLED, now, tx);
            return { type: "open_shift_exists" };
          }

          if (this.isStartOnlyDailyClose()) {
            const endTime = this.getDailyCloseEndTime(openShift);
            const durationMinutes = this.calculateDurationMinutes(openShift.startTime, endTime);
            autoClosed = await this.shiftRepo.dailyAutoCloseShift(openShift.id, endTime, durationMinutes, processedAt, tx);
          } else {
            const endTime = new Date(openShift.startTime.getTime() + maxShiftMs);
            const durationMinutes = this.config.maxShiftHours * 60;
            autoClosed = await this.shiftRepo.autoCloseShift(openShift.id, endTime, durationMinutes, processedAt, tx);
          }

          if (!autoClosed) {
            await this.pendingRepo.updateStatus(pending.id, PendingActionStatus.CANCELLED, now, tx);
            return { type: "open_shift_exists" };
          }
        }

        const shift = await this.shiftRepo.createShiftStart(
          {
            employeeId: employee.id,
            startTime: messageTime,
            startPhotoFileId: pending.photoFileId,
            startMessageId: pending.photoMessageId,
            startChatId: pending.chatId
          },
          tx
        );

        return {
          type: "confirmed_start",
          shift,
          employee,
          autoClose: this.isStartOnlyDailyClose() ? null : autoClosed
        };
      }

      if (this.isStartOnlyDailyClose()) {
        await this.pendingRepo.updateStatus(pending.id, PendingActionStatus.CANCELLED, now, tx);
        return { type: "open_shift_exists" };
      }

      const openShift = pending.targetShiftId != null
        ? await this.shiftRepo.findShiftById(pending.targetShiftId, tx)
        : await this.shiftRepo.findLastShift(employee.id, tx);
      if (!openShift || openShift.employeeId !== employee.id || messageTime < openShift.startTime ||
          (openShift.endTime && !(openShift.closedReason === ClosedReason.AUTO_TIMEOUT && messageTime < openShift.endTime))) {
        await this.pendingRepo.updateStatus(pending.id, PendingActionStatus.CANCELLED, now, tx);
        return { type: "no_open_shift" };
      }

      const overdue = messageTime.getTime() >= openShift.startTime.getTime() + maxShiftMs;
      if (overdue) {
        const endTime = new Date(openShift.startTime.getTime() + maxShiftMs);
        const durationMinutes = this.config.maxShiftHours * 60;
        const autoClosed = await this.shiftRepo.autoCloseShift(openShift.id, endTime, durationMinutes, processedAt, tx);
        if (autoClosed) {
          return { type: "auto_closed", autoClose: autoClosed };
        }
        await this.pendingRepo.updateStatus(pending.id, PendingActionStatus.CANCELLED, now, tx);
        return { type: "no_open_shift" };
      }

      const durationMinutes = Math.max(
        0,
        Math.round((messageTime.getTime() - openShift.startTime.getTime()) / 60000)
      );

      const shift = await this.shiftRepo.closeShiftByUserPhoto(
        {
          shiftId: openShift.id,
          endTime: messageTime,
          endPhotoFileId: pending.photoFileId,
          endMessageId: pending.photoMessageId,
          endChatId: pending.chatId,
          durationMinutes
        },
        tx
      );

      return { type: "confirmed_end", shift, employee, durationMinutes };
    });
  }

  async cancelAction(id: number, userId: string, now: Date = updateReceivedAt() ?? this.clock.now()): Promise<PendingActionCancelResult> {
    return this.runInTransaction(async (tx) => {
      const pending = await this.pendingRepo.findById(id, tx);
      if (!pending) {
        return { type: "not_found" };
      }

      if (pending.telegramUserId !== userId) {
        return { type: "forbidden" };
      }

      if (pending.status !== PendingActionStatus.PENDING) {
        return { type: "already_handled", status: pending.status };
      }

      if (pending.expiresAt <= now) {
        await this.pendingRepo.updateStatus(pending.id, PendingActionStatus.EXPIRED, now, tx);
        return { type: "expired" };
      }

      const updated = await this.pendingRepo.updateStatusIfPending(pending.id, now, PendingActionStatus.CANCELLED, tx);
      if (updated === 0) {
        const refreshed = await this.pendingRepo.findById(pending.id, tx);
        if (refreshed && refreshed.status === PendingActionStatus.PENDING && refreshed.expiresAt <= now) {
          await this.pendingRepo.updateStatus(refreshed.id, PendingActionStatus.EXPIRED, now, tx);
          return { type: "expired" };
        }
        return refreshed
          ? { type: "already_handled", status: refreshed.status }
          : { type: "not_found" };
      }

      return { type: "cancelled" };
    });
  }

  async expirePendingActions(now: Date = this.clock.now(), limit?: number): Promise<number> {
    return this.pendingRepo.expirePendingActions(now, limit);
  }

  async hasActivePendingAction(telegramUserId: string, now: Date = this.clock.now()): Promise<boolean> {
    return this.pendingRepo.hasActiveForUser(telegramUserId, now);
  }

  private isStartOnlyDailyClose(): boolean {
    return this.config.profile === "start_only_daily_close";
  }

  private getDailyAutoCloseConfig(): { closeTime: string; timezone: string } {
    if (!this.config.dailyAutoClose) {
      throw new Error("dailyAutoClose config is required for start_only_daily_close profile");
    }
    return this.config.dailyAutoClose;
  }

  private isDailyCloseDue(shift: ShiftRecord, now: Date): boolean {
    const config = this.getDailyAutoCloseConfig();
    return isDailyCloseDue(shift.startTime, now, config.timezone, config.closeTime);
  }

  private getDailyCloseEndTime(shift: ShiftRecord): Date {
    const config = this.getDailyAutoCloseConfig();
    return getDailyCloseEndTimeForShift(shift.startTime, config.timezone, config.closeTime);
  }

  private calculateDurationMinutes(startTime: Date, endTime: Date): number {
    return Math.max(0, Math.round((endTime.getTime() - startTime.getTime()) / 60000));
  }
}
