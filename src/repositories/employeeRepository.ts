import { prisma } from "../db/prisma";
import { EmployeeRecord, TelegramUserInput } from "../domain/types";

export interface EmployeeRepository {
  upsertFromTelegram(user: TelegramUserInput): Promise<EmployeeRecord>;
  findByTelegramUserId(telegramUserId: string): Promise<EmployeeRecord | null>;
  findById(id: number): Promise<EmployeeRecord | null>;
  findByIds(ids: number[]): Promise<EmployeeRecord[]>;
  updateNameByTelegramUserId(telegramUserId: string, data: {
    firstName: string;
    lastName: string;
    displayName: string;
  }): Promise<EmployeeRecord | null>;
  listEmployees(params: { page: number; pageSize: number; query?: string }): Promise<{
    items: EmployeeRecord[];
    total: number;
  }>;
}

const buildDisplayName = (user: TelegramUserInput): string => {
  const parts = [user.firstName, user.lastName].filter(Boolean);
  if (parts.length > 0) {
    return parts.join(" ");
  }
  if (user.username) {
    return `@${user.username}`;
  }
  return `user:${user.id}`;
};

const isBlank = (value?: string | null): boolean => !value || value.trim().length === 0;

export class PrismaEmployeeRepository implements EmployeeRepository {
  async upsertFromTelegram(user: TelegramUserInput): Promise<EmployeeRecord> {
    const telegramUserId = String(user.id);
    const displayName = buildDisplayName(user);
    const existing = await prisma.employee.findUnique({ where: { telegramUserId } });

    if (!existing) {
      return prisma.employee.create({
        data: {
          telegramUserId,
          username: user.username ?? null,
          firstName: user.firstName ?? null,
          lastName: user.lastName ?? null,
          displayName
        }
      });
    }

    const update: {
      username: string | null;
      firstName?: string | null;
      lastName?: string | null;
      displayName?: string;
    } = {
      username: user.username ?? null
    };

    if (isBlank(existing.firstName) && user.firstName) {
      update.firstName = user.firstName;
    }
    if (isBlank(existing.lastName) && user.lastName) {
      update.lastName = user.lastName;
    }
    if (isBlank(existing.displayName)) {
      update.displayName = displayName;
    }

    return prisma.employee.update({
      where: { telegramUserId },
      data: update
    });
  }

  async findByTelegramUserId(telegramUserId: string): Promise<EmployeeRecord | null> {
    return prisma.employee.findUnique({
      where: { telegramUserId }
    });
  }

  async findById(id: number): Promise<EmployeeRecord | null> {
    return prisma.employee.findUnique({ where: { id } });
  }

  async findByIds(ids: number[]): Promise<EmployeeRecord[]> {
    if (ids.length === 0) {
      return [];
    }
    return prisma.employee.findMany({
      where: { id: { in: ids } }
    });
  }

  async listEmployees(params: { page: number; pageSize: number; query?: string }): Promise<{
    items: EmployeeRecord[];
    total: number;
  }> {
    const page = Math.max(1, params.page);
    const pageSize = Math.min(20, Math.max(1, params.pageSize));
    const query = params.query?.trim();
    const where = query
      ? {
          OR: [
            { displayName: { contains: query, mode: "insensitive" as const } },
            { username: { contains: query, mode: "insensitive" as const } },
            { firstName: { contains: query, mode: "insensitive" as const } },
            { lastName: { contains: query, mode: "insensitive" as const } },
            { telegramUserId: { contains: query, mode: "insensitive" as const } }
          ]
        }
      : {};

    const [total, items] = await prisma.$transaction([
      prisma.employee.count({ where }),
      prisma.employee.findMany({
        where,
        orderBy: { displayName: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ]);

    return { total, items };
  }

  async updateNameByTelegramUserId(telegramUserId: string, data: {
    firstName: string;
    lastName: string;
    displayName: string;
  }): Promise<EmployeeRecord | null> {
    const updated = await prisma.employee.updateMany({
      where: { telegramUserId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        displayName: data.displayName
      }
    });

    if (updated.count === 0) {
      return null;
    }

    return prisma.employee.findUnique({ where: { telegramUserId } });
  }
}
