import { PendingActionStatus, PendingActionType, ViolationType, type Prisma } from "@prisma/client";
import { EmployeeRepository } from "../repositories/employeeRepository";
import { ShiftRepository } from "../repositories/shiftRepository";
import { PendingActionRepository } from "../repositories/pendingActionRepository";
import { EmployeeRecord, PendingActionRecord, ShiftRecord, ShiftWithRelations } from "../domain/types";

type DbClient = Prisma.TransactionClient;
type TransactionRunner = <T>(fn: (tx?: DbClient) => Promise<T>) => Promise<T>;

export interface PendingActionConfig {
  ttlMinutes: number;
  maxShiftHours: number;
  minShiftMinutes: number;
  shortShiftGraceMinutes: number;
}

export type PendingActionCreateResult =
  | { type: "duplicate" }
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
  constructor(
    private employeeRepo: EmployeeRepository,
    private shiftRepo: ShiftRepository,
    private pendingRepo: PendingActionRepository,
    private config: PendingActionConfig,
    private runInTransaction: TransactionRunner
  ) {}

  async createFromPhoto(params: {
    user: { id: number; username?: string; firstName?: string; lastName?: string; chatId: number };
    messageId: number;
    chatId: number;
    fileId: string;
    messageDate: Date;
  }): Promise<PendingActionCreateResult> {
    const chatId = String(params.chatId);
    const alreadyProcessed = await this.shiftRepo.isMessageProcessed(chatId, params.messageId);
    if (alreadyProcessed) {
      return { type: "duplicate" };
    }

    const existingPending = await this.pendingRepo.findByChatMessage(chatId, params.messageId);
    if (existingPending) {
      return { type: "duplicate" };
    }

    const employee = await this.employeeRepo.upsertFromTelegram(params.user);
    const openShift = await this.shiftRepo.findOpenShift(employee.id);

    const maxShiftMs = this.config.maxShiftHours * 60 * 60 * 1000;
    const isOverdue = openShift
      ? params.messageDate.getTime() >= openShift.startTime.getTime() + maxShiftMs
      : false;
    const actionType = !openShift || isOverdue ? PendingActionType.START : PendingActionType.END;

    const createdAt = params.messageDate;
    const expiresAt = new Date(createdAt.getTime() + this.config.ttlMinutes * 60 * 1000);

    const pendingAction = await this.pendingRepo.createPendingAction({
      employeeId: employee.id,
      telegramUserId: employee.telegramUserId,
      chatId,
      actionType,
      photoFileId: params.fileId,
      photoMessageId: params.messageId,
      createdAt,
      expiresAt
    });

    return { type: "pending", pendingAction, actionType, employee };
  }

  async confirmAction(id: number, userId: string, now: Date = new Date()): Promise<PendingActionConfirmResult> {
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
      const maxShiftMs = this.config.maxShiftHours * 60 * 60 * 1000;

      if (pending.actionType === PendingActionType.START) {
        const openShift = await this.shiftRepo.findOpenShift(employee.id, tx);
        let autoClosed: ShiftWithRelations | null = null;
        if (openShift) {
          const overdue = messageTime.getTime() >= openShift.startTime.getTime() + maxShiftMs;
          if (!overdue) {
            await this.pendingRepo.updateStatus(pending.id, PendingActionStatus.CANCELLED, now, tx);
            return { type: "open_shift_exists" };
          }

          const endTime = new Date(openShift.startTime.getTime() + maxShiftMs);
          const durationMinutes = this.config.maxShiftHours * 60;
          autoClosed = await this.shiftRepo.autoCloseShift(openShift.id, endTime, durationMinutes, now, tx);
          if (!autoClosed) {
            await this.pendingRepo.updateStatus(pending.id, PendingActionStatus.CANCELLED, now, tx);
            return { type: "open_shift_exists" };
          }
          await this.applyShortShiftViolation(autoClosed.id, durationMinutes, tx);
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

        return { type: "confirmed_start", shift, employee, autoClose: autoClosed };
      }

      const openShift = await this.shiftRepo.findOpenShift(employee.id, tx);
      if (!openShift) {
        await this.pendingRepo.updateStatus(pending.id, PendingActionStatus.CANCELLED, now, tx);
        return { type: "no_open_shift" };
      }

      const overdue = messageTime.getTime() >= openShift.startTime.getTime() + maxShiftMs;
      if (overdue) {
        const endTime = new Date(openShift.startTime.getTime() + maxShiftMs);
        const durationMinutes = this.config.maxShiftHours * 60;
        const autoClosed = await this.shiftRepo.autoCloseShift(openShift.id, endTime, durationMinutes, now, tx);
        if (autoClosed) {
          await this.applyShortShiftViolation(autoClosed.id, durationMinutes, tx);
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

      await this.applyShortShiftViolation(shift.id, durationMinutes, tx);

      return { type: "confirmed_end", shift, employee, durationMinutes };
    });
  }

  async cancelAction(id: number, userId: string, now: Date = new Date()): Promise<PendingActionCancelResult> {
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

  async expirePendingActions(now: Date = new Date(), limit?: number): Promise<number> {
    return this.pendingRepo.expirePendingActions(now, limit);
  }

  async hasActivePendingAction(telegramUserId: string, now: Date = new Date()): Promise<boolean> {
    return this.pendingRepo.hasActiveForUser(telegramUserId, now);
  }

  private async applyShortShiftViolation(
    shiftId: number,
    durationMinutes: number | null,
    tx?: DbClient
  ): Promise<void> {
    if (durationMinutes === null) {
      return;
    }

    const threshold = this.config.minShiftMinutes - this.config.shortShiftGraceMinutes;
    if (durationMinutes < threshold) {
      await this.shiftRepo.createViolation(shiftId, ViolationType.SHORT_SHIFT, tx);
    }
  }
}
