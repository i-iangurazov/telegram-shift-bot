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

test("concurrent confirm callback is idempotent", async () => {
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

  const createdAt = new Date("2024-04-01T09:00:00Z");
  const createResult = await pendingService.createFromPhoto({
    user: { id: 900, firstName: "Race", lastName: "Test", chatId: 900 },
    messageId: 901,
    chatId: 900,
    fileId: "photo-race",
    messageDate: createdAt
  });

  if (createResult.type !== "pending") {
    throw new Error("expected pending action");
  }

  const now = new Date(createdAt.getTime() + 60 * 1000);
  const [r1, r2] = await Promise.all([
    pendingService.confirmAction(createResult.pendingAction.id, "900", now),
    pendingService.confirmAction(createResult.pendingAction.id, "900", now)
  ]);

  const types = [r1.type, r2.type];
  expect(types).toContain("confirmed_start");
  expect(types).toContain("already_handled");

  const shifts = await prisma.shift.findMany({ where: { employeeId: createResult.employee.id } });
  expect(shifts.length).toBe(1);
});
