import { PrismaEmployeeRepository } from "../../src/repositories/employeeRepository";
import { PrismaShiftRepository } from "../../src/repositories/shiftRepository";
import { runPhotoRetentionCleanupOnce } from "../../src/jobs/tasks/photoRetentionTask";
import { env } from "../../src/config/env";
import { prisma } from "../../src/db/prisma";
import { resetDb, disconnectDb } from "../helpers/createTestDb";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnectDb();
});

test("photo retention purges old file ids", async () => {
  const employeeRepo = new PrismaEmployeeRepository();
  const shiftRepo = new PrismaShiftRepository();

  const employee = await employeeRepo.upsertFromTelegram({
    id: 600,
    firstName: "Nina",
    lastName: "Petrova",
    chatId: 600
  });

  const now = new Date("2024-03-10T12:00:00Z");
  const oldStart = new Date(now.getTime() - (env.photoRetentionDays + 1) * 24 * 60 * 60 * 1000);

  const shift = await shiftRepo.createShiftStart({
    employeeId: employee.id,
    startTime: oldStart,
    startPhotoFileId: "old-start",
    startMessageId: 801,
    startChatId: "600"
  });

  await prisma.shift.update({
    where: { id: shift.id },
    data: {
      endTime: new Date(oldStart.getTime() + 2 * 60 * 60 * 1000),
      endPhotoFileId: "old-end",
      endMessageId: 802,
      endChatId: "600"
    }
  });

  const purged = await runPhotoRetentionCleanupOnce(shiftRepo, { now });
  expect(purged).toBeGreaterThanOrEqual(1);

  const updated = await prisma.shift.findUnique({ where: { id: shift.id } });
  expect(updated?.startPhotoFileId).toBeNull();
  expect(updated?.endPhotoFileId).toBeNull();
  expect(updated?.photosPurgedAt).not.toBeNull();
});
