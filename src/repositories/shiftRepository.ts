import { ClosedReason, ViolationType, type Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { ShiftRecord, ShiftWithRelations } from "../domain/types";

type DbClient = Prisma.TransactionClient;

export interface ShiftRepository {
  findOpenShift(employeeId: number, tx?: DbClient): Promise<ShiftRecord | null>;
  findLastShift(employeeId: number): Promise<ShiftRecord | null>;
  isMessageProcessed(chatId: string, messageId: number): Promise<boolean>;
  createShiftStart(data: {
    employeeId: number;
    startTime: Date;
    startPhotoFileId: string;
    startMessageId: number;
    startChatId: string;
  }, tx?: DbClient): Promise<ShiftRecord>;
  closeShiftByUserPhoto(data: {
    shiftId: number;
    endTime: Date;
    endPhotoFileId: string;
    endMessageId: number;
    endChatId: string;
    durationMinutes: number;
  }, tx?: DbClient): Promise<ShiftRecord>;
  createViolation(shiftId: number, type: ViolationType, tx?: DbClient): Promise<void>;
  findOverdueShifts(cutoff: Date, take?: number): Promise<ShiftWithRelations[]>;
  autoCloseShift(shiftId: number, endTime: Date, durationMinutes: number, now: Date, tx?: DbClient): Promise<ShiftWithRelations | null>;
  findShiftsInRange(from: Date, to: Date, options?: { limit?: number; order?: "asc" | "desc" }): Promise<ShiftWithRelations[]>;
  findEmployeeShiftsInRange(
    employeeId: number,
    from: Date,
    to: Date,
    options: { limit: number; skip?: number }
  ): Promise<ShiftWithRelations[]>;
  findShiftById(shiftId: number): Promise<ShiftWithRelations | null>;
  purgeOldPhotos(cutoff: Date, now: Date, take?: number): Promise<number>;
  aggregateEmployeeStats(employeeId: number, from: Date, to: Date): Promise<{
    totalShifts: number;
    totalDurationMinutes: number;
    averageDurationMinutes: number;
  }>;
  countEmployeeViolations(employeeId: number, from: Date, to: Date): Promise<number>;
  countEmployeeViolationsByType(employeeId: number, from: Date, to: Date): Promise<{
    notClosedInTime: number;
    shortShift: number;
    total: number;
  }>;
  groupByEmployeeStats(from: Date, to: Date): Promise<Array<{
    employeeId: number;
    totalShifts: number;
    totalDurationMinutes: number;
    averageDurationMinutes: number;
  }>>;
  countViolationsByEmployee(from: Date, to: Date): Promise<Array<{ employeeId: number; violations: number }>>;
  countViolationsByEmployeeAndType(from: Date, to: Date): Promise<Array<{ employeeId: number; type: ViolationType; count: number }>>;
  findLastShiftsByEmployee(from: Date, to: Date): Promise<Array<{
    employeeId: number;
    startTime: Date;
    endTime: Date | null;
    closedReason: ClosedReason | null;
  }>>;
}

export class PrismaShiftRepository implements ShiftRepository {
  async findOpenShift(employeeId: number, tx?: DbClient): Promise<ShiftRecord | null> {
    const client = tx ?? prisma;
    return client.shift.findFirst({
      where: { employeeId, endTime: null },
      orderBy: { startTime: "desc" }
    });
  }

  async findLastShift(employeeId: number): Promise<ShiftRecord | null> {
    return prisma.shift.findFirst({
      where: { employeeId },
      orderBy: { startTime: "desc" }
    });
  }

  async isMessageProcessed(chatId: string, messageId: number): Promise<boolean> {
    const existing = await prisma.shift.findFirst({
      where: {
        OR: [
          { startChatId: chatId, startMessageId: messageId },
          { endChatId: chatId, endMessageId: messageId }
        ]
      },
      select: { id: true }
    });

    return Boolean(existing);
  }

  async createShiftStart(data: {
    employeeId: number;
    startTime: Date;
    startPhotoFileId: string;
    startMessageId: number;
    startChatId: string;
  }, tx?: DbClient): Promise<ShiftRecord> {
    const client = tx ?? prisma;
    return client.shift.create({
      data: {
        employeeId: data.employeeId,
        startTime: data.startTime,
        startPhotoFileId: data.startPhotoFileId,
        startMessageId: data.startMessageId,
        startChatId: data.startChatId,
        employeeChatId: data.startChatId
      }
    });
  }

  async closeShiftByUserPhoto(data: {
    shiftId: number;
    endTime: Date;
    endPhotoFileId: string;
    endMessageId: number;
    endChatId: string;
    durationMinutes: number;
  }, tx?: DbClient): Promise<ShiftRecord> {
    const client = tx ?? prisma;
    return client.shift.update({
      where: { id: data.shiftId },
      data: {
        endTime: data.endTime,
        endPhotoFileId: data.endPhotoFileId,
        endMessageId: data.endMessageId,
        endChatId: data.endChatId,
        closedReason: ClosedReason.USER_PHOTO,
        durationMinutes: data.durationMinutes
      }
    });
  }

  async createViolation(shiftId: number, type: ViolationType, tx?: DbClient): Promise<void> {
    const client = tx ?? prisma;
    await client.shiftViolation.createMany({
      data: [{ shiftId, type }],
      skipDuplicates: true
    });
  }

  async findOverdueShifts(cutoff: Date, take?: number): Promise<ShiftWithRelations[]> {
    return prisma.shift.findMany({
      where: { endTime: null, alertedAt: null, startTime: { lte: cutoff } },
      include: { employee: true, violations: true },
      orderBy: { startTime: "asc" },
      take
    });
  }

  async autoCloseShift(
    shiftId: number,
    endTime: Date,
    durationMinutes: number,
    now: Date,
    tx?: DbClient
  ): Promise<ShiftWithRelations | null> {
    if (tx) {
      const updated = await tx.shift.updateMany({
        where: { id: shiftId, endTime: null, alertedAt: null },
        data: {
          endTime,
          closedReason: ClosedReason.AUTO_TIMEOUT,
          durationMinutes,
          autoClosedAt: now,
          alertedAt: now
        }
      });

      if (updated.count === 0) {
        return null;
      }

      await tx.shiftViolation.createMany({
        data: [{ shiftId, type: ViolationType.NOT_CLOSED_IN_TIME }],
        skipDuplicates: true
      });

      return tx.shift.findUnique({
        where: { id: shiftId },
        include: { employee: true, violations: true }
      });
    }

    return prisma.$transaction(async (innerTx) => {
      const updated = await innerTx.shift.updateMany({
        where: { id: shiftId, endTime: null, alertedAt: null },
        data: {
          endTime,
          closedReason: ClosedReason.AUTO_TIMEOUT,
          durationMinutes,
          autoClosedAt: now,
          alertedAt: now
        }
      });

      if (updated.count === 0) {
        return null;
      }

      await innerTx.shiftViolation.createMany({
        data: [{ shiftId, type: ViolationType.NOT_CLOSED_IN_TIME }],
        skipDuplicates: true
      });

      return innerTx.shift.findUnique({
        where: { id: shiftId },
        include: { employee: true, violations: true }
      });
    });
  }

  async findShiftsInRange(
    from: Date,
    to: Date,
    options?: { limit?: number; order?: "asc" | "desc" }
  ): Promise<ShiftWithRelations[]> {
    return prisma.shift.findMany({
      where: { startTime: { gte: from, lte: to } },
      include: { employee: true, violations: true },
      orderBy: [{ employeeId: "asc" }, { startTime: options?.order ?? "asc" }],
      take: options?.limit
    });
  }

  async findEmployeeShiftsInRange(
    employeeId: number,
    from: Date,
    to: Date,
    options: { limit: number; skip?: number }
  ): Promise<ShiftWithRelations[]> {
    return prisma.shift.findMany({
      where: { employeeId, startTime: { gte: from, lte: to } },
      include: { employee: true, violations: true },
      orderBy: { startTime: "desc" },
      skip: options.skip,
      take: options.limit
    });
  }

  async findShiftById(shiftId: number): Promise<ShiftWithRelations | null> {
    return prisma.shift.findUnique({
      where: { id: shiftId },
      include: { employee: true, violations: true }
    });
  }

  async purgeOldPhotos(cutoff: Date, now: Date, take?: number): Promise<number> {
    if (!take) {
      const result = await prisma.shift.updateMany({
        where: {
          startTime: { lt: cutoff },
          photosPurgedAt: null
        },
        data: {
          startPhotoFileId: null,
          endPhotoFileId: null,
          photosPurgedAt: now
        }
      });

      return result.count;
    }

    const candidates = await prisma.shift.findMany({
      where: {
        startTime: { lt: cutoff },
        photosPurgedAt: null
      },
      select: { id: true },
      orderBy: { startTime: "asc" },
      take
    });

    if (candidates.length === 0) {
      return 0;
    }

    const ids = candidates.map((item) => item.id);
    const result = await prisma.shift.updateMany({
      where: { id: { in: ids }, photosPurgedAt: null },
      data: {
        startPhotoFileId: null,
        endPhotoFileId: null,
        photosPurgedAt: now
      }
    });

    return result.count;
  }

  async aggregateEmployeeStats(employeeId: number, from: Date, to: Date): Promise<{
    totalShifts: number;
    totalDurationMinutes: number;
    averageDurationMinutes: number;
  }> {
    const result = await prisma.shift.aggregate({
      where: { employeeId, startTime: { gte: from, lte: to } },
      _count: { _all: true },
      _sum: { durationMinutes: true },
      _avg: { durationMinutes: true }
    });

    return {
      totalShifts: result._count._all,
      totalDurationMinutes: result._sum.durationMinutes ?? 0,
      averageDurationMinutes: Math.round(result._avg.durationMinutes ?? 0)
    };
  }

  async countEmployeeViolations(employeeId: number, from: Date, to: Date): Promise<number> {
    return prisma.shiftViolation.count({
      where: {
        shift: { employeeId, startTime: { gte: from, lte: to } },
        type: { not: ViolationType.SHORT_SHIFT }
      }
    });
  }

  async countEmployeeViolationsByType(employeeId: number, from: Date, to: Date): Promise<{
    notClosedInTime: number;
    shortShift: number;
    total: number;
  }> {
    const rows = await prisma.shiftViolation.groupBy({
      by: ["type"],
      where: {
        shift: { employeeId, startTime: { gte: from, lte: to } },
        type: { not: ViolationType.SHORT_SHIFT }
      },
      _count: { _all: true }
    });

    let notClosedInTime = 0;
    let shortShift = 0;
    let total = 0;

    for (const row of rows) {
      total += row._count._all;
      if (row.type === ViolationType.NOT_CLOSED_IN_TIME) {
        notClosedInTime = row._count._all;
      }
    }

    return { notClosedInTime, shortShift: 0, total };
  }

  async groupByEmployeeStats(from: Date, to: Date): Promise<Array<{
    employeeId: number;
    totalShifts: number;
    totalDurationMinutes: number;
    averageDurationMinutes: number;
  }>> {
    const rows = await prisma.shift.groupBy({
      by: ["employeeId"],
      where: { startTime: { gte: from, lte: to } },
      _count: { _all: true },
      _sum: { durationMinutes: true },
      _avg: { durationMinutes: true }
    });

    return rows.map((row) => ({
      employeeId: row.employeeId,
      totalShifts: row._count._all,
      totalDurationMinutes: row._sum.durationMinutes ?? 0,
      averageDurationMinutes: Math.round(row._avg.durationMinutes ?? 0)
    }));
  }

  async countViolationsByEmployee(from: Date, to: Date): Promise<Array<{ employeeId: number; violations: number }>> {
    const rows = await prisma.$queryRaw<Array<{ employeeId: number; violations: number }>>`
      SELECT s."employeeId" AS "employeeId",
             COUNT(v.*)::int AS "violations"
      FROM "Shift" s
      JOIN "ShiftViolation" v ON v."shiftId" = s."id"
      WHERE s."startTime" >= ${from}
        AND s."startTime" <= ${to}
        AND v."type" <> 'SHORT_SHIFT'
      GROUP BY s."employeeId"
    `;

    return rows;
  }

  async countViolationsByEmployeeAndType(
    from: Date,
    to: Date
  ): Promise<Array<{ employeeId: number; type: ViolationType; count: number }>> {
    const rows = await prisma.$queryRaw<Array<{ employeeId: number; type: ViolationType; count: number }>>`
      SELECT s."employeeId" AS "employeeId",
             v."type" AS "type",
             COUNT(v.*)::int AS "count"
      FROM "Shift" s
      JOIN "ShiftViolation" v ON v."shiftId" = s."id"
      WHERE s."startTime" >= ${from}
        AND s."startTime" <= ${to}
        AND v."type" <> 'SHORT_SHIFT'
      GROUP BY s."employeeId", v."type"
    `;

    return rows;
  }

  async findLastShiftsByEmployee(from: Date, to: Date): Promise<Array<{
    employeeId: number;
    startTime: Date;
    endTime: Date | null;
    closedReason: ClosedReason | null;
  }>> {
    const rows = await prisma.$queryRaw<Array<{
      employeeId: number;
      startTime: Date;
      endTime: Date | null;
      closedReason: ClosedReason | null;
    }>>`
      SELECT DISTINCT ON (s."employeeId")
        s."employeeId" AS "employeeId",
        s."startTime" AS "startTime",
        s."endTime" AS "endTime",
        s."closedReason" AS "closedReason"
      FROM "Shift" s
      WHERE s."startTime" >= ${from}
        AND s."startTime" <= ${to}
      ORDER BY s."employeeId", s."startTime" DESC
    `;

    return rows;
  }
}
