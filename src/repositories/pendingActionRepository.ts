import { PendingActionStatus, PendingActionType, type Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { PendingActionRecord } from "../domain/types";

type DbClient = Prisma.TransactionClient;

export interface PendingActionRepository {
  findById(id: number, tx?: DbClient): Promise<PendingActionRecord | null>;
  findByChatMessage(chatId: string, messageId: number, tx?: DbClient): Promise<PendingActionRecord | null>;
  createPendingAction(data: {
    employeeId: number;
    telegramUserId: string;
    chatId: string;
    actionType: PendingActionType;
    photoFileId: string;
    photoMessageId: number;
    createdAt: Date;
    expiresAt: Date;
  }, tx?: DbClient): Promise<PendingActionRecord>;
  updateStatus(id: number, status: PendingActionStatus, now: Date, tx?: DbClient): Promise<PendingActionRecord | null>;
  updateStatusIfPending(id: number, now: Date, status: PendingActionStatus, tx?: DbClient): Promise<number>;
  expirePendingActions(now: Date, limit?: number): Promise<number>;
}

export class PrismaPendingActionRepository implements PendingActionRepository {
  async findById(id: number, tx?: DbClient): Promise<PendingActionRecord | null> {
    const client = tx ?? prisma;
    return client.pendingAction.findUnique({ where: { id } });
  }

  async findByChatMessage(chatId: string, messageId: number, tx?: DbClient): Promise<PendingActionRecord | null> {
    const client = tx ?? prisma;
    return client.pendingAction.findUnique({
      where: { chatId_photoMessageId: { chatId, photoMessageId: messageId } }
    });
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
  }, tx?: DbClient): Promise<PendingActionRecord> {
    const client = tx ?? prisma;
    return client.pendingAction.create({
      data: {
        employeeId: data.employeeId,
        telegramUserId: data.telegramUserId,
        chatId: data.chatId,
        actionType: data.actionType,
        photoFileId: data.photoFileId,
        photoMessageId: data.photoMessageId,
        createdAt: data.createdAt,
        expiresAt: data.expiresAt
      }
    });
  }

  async updateStatus(id: number, status: PendingActionStatus, now: Date, tx?: DbClient): Promise<PendingActionRecord | null> {
    const client = tx ?? prisma;
    const updated = await client.pendingAction.updateMany({
      where: { id },
      data: { status, updatedAt: now }
    });

    if (updated.count === 0) {
      return null;
    }

    return client.pendingAction.findUnique({ where: { id } });
  }

  async updateStatusIfPending(id: number, now: Date, status: PendingActionStatus, tx?: DbClient): Promise<number> {
    const client = tx ?? prisma;
    const updated = await client.pendingAction.updateMany({
      where: {
        id,
        status: PendingActionStatus.PENDING,
        expiresAt: { gt: now }
      },
      data: {
        status,
        updatedAt: now
      }
    });

    return updated.count;
  }

  async expirePendingActions(now: Date, limit?: number): Promise<number> {
    if (!limit) {
      const updated = await prisma.pendingAction.updateMany({
        where: {
          status: PendingActionStatus.PENDING,
          expiresAt: { lte: now }
        },
        data: {
          status: PendingActionStatus.EXPIRED,
          updatedAt: now
        }
      });

      return updated.count;
    }

    const candidates = await prisma.pendingAction.findMany({
      where: {
        status: PendingActionStatus.PENDING,
        expiresAt: { lte: now }
      },
      select: { id: true },
      orderBy: { expiresAt: "asc" },
      take: limit
    });

    if (candidates.length === 0) {
      return 0;
    }

    const ids = candidates.map((item) => item.id);
    const updated = await prisma.pendingAction.updateMany({
      where: {
        id: { in: ids },
        status: PendingActionStatus.PENDING
      },
      data: {
        status: PendingActionStatus.EXPIRED,
        updatedAt: now
      }
    });

    return updated.count;
  }
}
