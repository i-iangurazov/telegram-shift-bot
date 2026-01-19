import {
  ClosedReason,
  EmployeeRoleOverride,
  PendingActionStatus,
  PendingActionType,
  ViolationType
} from "@prisma/client";

export interface TelegramUserInput {
  id: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  chatId: number;
}

export interface EmployeeRecord {
  id: number;
  telegramUserId: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName: string;
  isActive: boolean;
  roleOverride: EmployeeRoleOverride;
}

export interface ShiftRecord {
  id: number;
  employeeId: number;
  startTime: Date;
  endTime: Date | null;
  startPhotoFileId: string | null;
  endPhotoFileId: string | null;
  startMessageId: number;
  startChatId: string;
  employeeChatId: string | null;
  endMessageId: number | null;
  endChatId: string | null;
  closedReason: ClosedReason | null;
  autoClosedAt: Date | null;
  alertedAt: Date | null;
  durationMinutes: number | null;
  photosPurgedAt: Date | null;
}

export interface ShiftViolationRecord {
  id: number;
  shiftId: number;
  type: ViolationType;
  createdAt: Date;
}

export interface ShiftWithRelations extends ShiftRecord {
  employee: EmployeeRecord;
  violations: ShiftViolationRecord[];
}

export interface PendingActionRecord {
  id: number;
  employeeId: number;
  telegramUserId: string;
  chatId: string;
  actionType: PendingActionType;
  photoFileId: string;
  photoMessageId: number;
  createdAt: Date;
  expiresAt: Date;
  status: PendingActionStatus;
  updatedAt: Date;
}
