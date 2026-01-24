import { prisma } from "../../src/db/prisma";
import { PrismaEmployeeRepository } from "../../src/repositories/employeeRepository";
import { PrismaShiftRepository } from "../../src/repositories/shiftRepository";
import { ShiftService } from "../../src/services/shiftService";
import { logger } from "../../src/config/logger";
import { env } from "../../src/config/env";
import { resetDb, disconnectDb } from "../helpers/createTestDb";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnectDb();
});

test("start and close shift by photo", async () => {
  const employeeRepo = new PrismaEmployeeRepository();
  const shiftRepo = new PrismaShiftRepository();
  const shiftService = new ShiftService(
    employeeRepo,
    shiftRepo,
    {
      maxShiftHours: env.maxShiftHours,
      minShiftMinutes: env.minShiftHours * 60,
      shortShiftGraceMinutes: env.shortShiftGraceMinutes
    },
    logger
  );

  const startTime = new Date("2024-01-01T08:00:00Z");
  const startResult = await shiftService.handlePhotoMessage({
    user: { id: 1, firstName: "Ivan", lastName: "Petrov", chatId: 1 },
    messageId: 100,
    chatId: 1,
    fileId: "file-start",
    messageDate: startTime
  });

  expect(startResult.type).toBe("started");
  const openShift = await shiftRepo.findOpenShift(startResult.employee.id);
  expect(openShift?.startPhotoFileId).toBe("file-start");
  expect(openShift?.employeeChatId).toBe("1");

  const endTime = new Date("2024-01-01T10:00:00Z");
  const closeResult = await shiftService.handlePhotoMessage({
    user: { id: 1, firstName: "Ivan", lastName: "Petrov", chatId: 1 },
    messageId: 101,
    chatId: 1,
    fileId: "file-end",
    messageDate: endTime
  });

  expect(closeResult.type).toBe("closed");
  const closedShift = await prisma.shift.findUnique({ where: { id: closeResult.shift.id } });
  expect(closedShift?.endPhotoFileId).toBe("file-end");
  expect(closedShift?.durationMinutes).toBe(120);
});

test("auto-close overdue shift creates violation", async () => {
  const employeeRepo = new PrismaEmployeeRepository();
  const shiftRepo = new PrismaShiftRepository();
  const shiftService = new ShiftService(
    employeeRepo,
    shiftRepo,
    {
      maxShiftHours: 12,
      minShiftMinutes: 8 * 60,
      shortShiftGraceMinutes: 0
    },
    logger
  );

  const employee = await employeeRepo.upsertFromTelegram({
    id: 200,
    firstName: "Oleg",
    lastName: "Ivanov",
    chatId: 200
  });

  const startTime = new Date("2024-01-01T00:00:00Z");
  const shift = await shiftRepo.createShiftStart({
    employeeId: employee.id,
    startTime,
    startPhotoFileId: "start-photo",
    startMessageId: 201,
    startChatId: "200"
  });

  const now = new Date("2024-01-01T13:00:00Z");
  const results = await shiftService.autoCloseOverdueShifts(now);
  expect(results.length).toBe(1);

  const updated = await prisma.shift.findUnique({ where: { id: shift.id } });
  expect(updated?.closedReason).toBe("AUTO_TIMEOUT");
  expect(updated?.autoClosedAt).not.toBeNull();

  const violations = await prisma.shiftViolation.findMany({ where: { shiftId: shift.id } });
  expect(violations.length).toBe(1);
  expect(violations[0].type).toBe("NOT_CLOSED_IN_TIME");

  const secondRun = await shiftService.autoCloseOverdueShifts(now);
  expect(secondRun.length).toBe(0);
});
