import { PrismaEmployeeRepository } from "../../src/repositories/employeeRepository";
import { PrismaShiftRepository } from "../../src/repositories/shiftRepository";
import { PrismaPendingActionRepository } from "../../src/repositories/pendingActionRepository";
import { PendingActionService } from "../../src/services/pendingActionService";
import { env } from "../../src/config/env";
import { prisma } from "../../src/db/prisma";
import { resetDb, disconnectDb } from "../helpers/createTestDb";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnectDb();
});

test("pending action confirm creates shift", async () => {
  const employeeRepo = new PrismaEmployeeRepository();
  const shiftRepo = new PrismaShiftRepository();
  const pendingRepo = new PrismaPendingActionRepository();
  const pendingService = new PendingActionService(
    employeeRepo,
    shiftRepo,
    pendingRepo,
    {
      ttlMinutes: env.pendingActionTtlMinutes,
      maxShiftHours: env.maxShiftHours,
      minShiftMinutes: env.minShiftHours * 60,
      shortShiftGraceMinutes: env.shortShiftGraceMinutes
    },
    async (fn) => prisma.$transaction(async (tx) => fn(tx))
  );

  const messageDate = new Date("2024-02-01T08:00:00Z");
  const createResult = await pendingService.createFromPhoto({
    user: { id: 300, firstName: "Anna", lastName: "Ivanova", chatId: 300 },
    messageId: 501,
    chatId: 300,
    fileId: "photo-1",
    messageDate
  });

  expect(createResult.type).toBe("pending");
  if (createResult.type !== "pending") {
    return;
  }

  const confirm = await pendingService.confirmAction(createResult.pendingAction.id, "300", messageDate);
  expect(confirm.type).toBe("confirmed_start");

  const shift = await prisma.shift.findFirst({ where: { employeeId: createResult.employee.id } });
  expect(shift).not.toBeNull();
});

test("pending action expires after TTL", async () => {
  const employeeRepo = new PrismaEmployeeRepository();
  const shiftRepo = new PrismaShiftRepository();
  const pendingRepo = new PrismaPendingActionRepository();
  const pendingService = new PendingActionService(
    employeeRepo,
    shiftRepo,
    pendingRepo,
    {
      ttlMinutes: 10,
      maxShiftHours: env.maxShiftHours,
      minShiftMinutes: env.minShiftHours * 60,
      shortShiftGraceMinutes: env.shortShiftGraceMinutes
    },
    async (fn) => prisma.$transaction(async (tx) => fn(tx))
  );

  const createdAt = new Date("2024-02-01T08:00:00Z");
  const createResult = await pendingService.createFromPhoto({
    user: { id: 400, firstName: "Pavel", lastName: "Sidorov", chatId: 400 },
    messageId: 601,
    chatId: 400,
    fileId: "photo-2",
    messageDate: createdAt
  });

  if (createResult.type !== "pending") {
    throw new Error("expected pending action");
  }

  const expiredAt = new Date(createdAt.getTime() + 11 * 60 * 1000);
  const confirmResult = await pendingService.confirmAction(createResult.pendingAction.id, "400", expiredAt);
  expect(confirmResult.type).toBe("expired");

  const stored = await prisma.pendingAction.findUnique({ where: { id: createResult.pendingAction.id } });
  expect(stored?.status).toBe("EXPIRED");
});

test("expirePendingActions clears old pending rows", async () => {
  const employeeRepo = new PrismaEmployeeRepository();
  const shiftRepo = new PrismaShiftRepository();
  const pendingRepo = new PrismaPendingActionRepository();
  const pendingService = new PendingActionService(
    employeeRepo,
    shiftRepo,
    pendingRepo,
    {
      ttlMinutes: 5,
      maxShiftHours: env.maxShiftHours,
      minShiftMinutes: env.minShiftHours * 60,
      shortShiftGraceMinutes: env.shortShiftGraceMinutes
    },
    async (fn) => prisma.$transaction(async (tx) => fn(tx))
  );

  const createdAt = new Date("2024-02-02T10:00:00Z");
  const createResult = await pendingService.createFromPhoto({
    user: { id: 500, firstName: "Daria", lastName: "Test", chatId: 500 },
    messageId: 701,
    chatId: 500,
    fileId: "photo-3",
    messageDate: createdAt
  });

  if (createResult.type !== "pending") {
    throw new Error("expected pending action");
  }

  const now = new Date(createdAt.getTime() + 6 * 60 * 1000);
  const expired = await pendingService.expirePendingActions(now);
  expect(expired).toBeGreaterThanOrEqual(1);

  const stored = await prisma.pendingAction.findUnique({ where: { id: createResult.pendingAction.id } });
  expect(stored?.status).toBe("EXPIRED");
});
