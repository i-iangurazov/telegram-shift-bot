import { ShiftRepository } from "../repositories/shiftRepository";
import { ViolationType } from "@prisma/client";
import { EmployeeRepository } from "../repositories/employeeRepository";
import { EmployeeRecord, ShiftRecord, ShiftWithRelations, TelegramUserInput } from "../domain/types";
import { Logger } from "../utils/logger";

export type ShiftActionResult =
  | { type: "duplicate" }
  | { type: "started"; shift: ShiftRecord; employee: EmployeeRecord }
  | { type: "closed"; shift: ShiftRecord; employee: EmployeeRecord; durationMinutes: number }
  | {
      type: "autoClosedAndStarted";
      autoClose: AutoCloseResult;
      startedShift: ShiftRecord;
      employee: EmployeeRecord;
    };

export interface AutoCloseResult {
  shift: ShiftWithRelations;
  endTime: Date;
  durationMinutes: number;
}

export interface ShiftServiceConfig {
  maxShiftHours: number;
  minShiftMinutes: number;
  shortShiftGraceMinutes: number;
}

export class ShiftService {
  constructor(
    private employeeRepo: EmployeeRepository,
    private shiftRepo: ShiftRepository,
    private config: ShiftServiceConfig,
    private logger: Logger
  ) {}

  async handlePhotoMessage(params: {
    user: TelegramUserInput;
    messageId: number;
    chatId: number;
    fileId: string;
    messageDate: Date;
  }): Promise<ShiftActionResult> {
    const chatId = String(params.chatId);
    const alreadyProcessed = await this.shiftRepo.isMessageProcessed(chatId, params.messageId);
    if (alreadyProcessed) {
      this.logger.info({ chatId, messageId: params.messageId }, "Duplicate message ignored");
      return { type: "duplicate" };
    }

    const employee = await this.employeeRepo.upsertFromTelegram(params.user);
    const openShift = await this.shiftRepo.findOpenShift(employee.id);

    if (!openShift) {
      const shift = await this.shiftRepo.createShiftStart({
        employeeId: employee.id,
        startTime: params.messageDate,
        startPhotoFileId: params.fileId,
        startMessageId: params.messageId,
        startChatId: chatId
      });

      return { type: "started", shift, employee };
    }

    const maxShiftMs = this.config.maxShiftHours * 60 * 60 * 1000;
    const overdueAt = openShift.startTime.getTime() + maxShiftMs;
    if (params.messageDate.getTime() >= overdueAt) {
      const endTime = new Date(overdueAt);
      const durationMinutes = this.config.maxShiftHours * 60;
      const updated = await this.shiftRepo.autoCloseShift(openShift.id, endTime, durationMinutes, params.messageDate);
      const startedShift = await this.shiftRepo.createShiftStart({
        employeeId: employee.id,
        startTime: params.messageDate,
        startPhotoFileId: params.fileId,
        startMessageId: params.messageId,
        startChatId: chatId
      });

      if (updated) {
        return { type: "autoClosedAndStarted", autoClose: { shift: updated, endTime, durationMinutes }, startedShift, employee };
      }

      return { type: "started", shift: startedShift, employee };
    }

    const durationMinutes = Math.max(
      0,
      Math.round((params.messageDate.getTime() - openShift.startTime.getTime()) / 60000)
    );

    const shift = await this.shiftRepo.closeShiftByUserPhoto({
      shiftId: openShift.id,
      endTime: params.messageDate,
      endPhotoFileId: params.fileId,
      endMessageId: params.messageId,
      endChatId: chatId,
      durationMinutes
    });

    await this.applyShortShiftViolation(shift.id, durationMinutes);

    return { type: "closed", shift, employee, durationMinutes };
  }

  async getOpenShiftStatus(telegramUserId: string): Promise<ShiftRecord | null> {
    const employee = await this.employeeRepo.findByTelegramUserId(telegramUserId);
    if (!employee) {
      return null;
    }
    return this.shiftRepo.findOpenShift(employee.id);
  }

  async autoCloseOverdueShifts(now: Date = new Date(), limit?: number): Promise<AutoCloseResult[]> {
    const maxShiftMs = this.config.maxShiftHours * 60 * 60 * 1000;
    const cutoff = new Date(now.getTime() - maxShiftMs);
    const overdueShifts = await this.shiftRepo.findOverdueShifts(cutoff, limit);
    const results: AutoCloseResult[] = [];

    for (const shift of overdueShifts) {
      const endTime = new Date(shift.startTime.getTime() + maxShiftMs);
      const durationMinutes = this.config.maxShiftHours * 60;
      const updated = await this.shiftRepo.autoCloseShift(shift.id, endTime, durationMinutes, now);
      if (updated) {
        await this.applyShortShiftViolation(updated.id, durationMinutes);
        results.push({ shift: updated, endTime, durationMinutes });
      }
    }

    return results;
  }

  private async applyShortShiftViolation(shiftId: number, durationMinutes: number | null): Promise<void> {
    if (durationMinutes === null) {
      return;
    }

    const threshold = this.config.minShiftMinutes - this.config.shortShiftGraceMinutes;
    if (durationMinutes < threshold) {
      await this.shiftRepo.createViolation(shiftId, ViolationType.SHORT_SHIFT);
    }
  }
}
