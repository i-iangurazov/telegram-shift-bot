import { ViolationType } from "@prisma/client";
import { ShiftService } from "../src/services/shiftService";
import { InMemoryDatabase, InMemoryEmployeeRepository, InMemoryShiftRepository } from "./helpers/inMemoryDb";

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

describe("ShiftService", () => {
  it("starts shift when no open shift", async () => {
    const db = new InMemoryDatabase();
    const employeeRepo = new InMemoryEmployeeRepository(db);
    const shiftRepo = new InMemoryShiftRepository(db);
    const service = new ShiftService(
      employeeRepo,
      shiftRepo,
      { maxShiftHours: 12, minShiftMinutes: 480, shortShiftGraceMinutes: 0 },
      logger
    );

    const result = await service.handlePhotoMessage({
      user: { id: 101, username: "user1", firstName: "Иван", lastName: "Иванов", chatId: 101 },
      messageId: 1,
      chatId: 101,
      fileId: "file-1",
      messageDate: new Date("2024-01-01T08:00:00Z")
    });

    expect(result.type).toBe("started");
    if (result.type === "started") {
      expect(result.shift.startPhotoFileId).toBe("file-1");
      expect(result.shift.startMessageId).toBe(1);
      expect(result.shift.endTime).toBeNull();
    }
  });

  it("closes shift when open", async () => {
    const db = new InMemoryDatabase();
    const employeeRepo = new InMemoryEmployeeRepository(db);
    const shiftRepo = new InMemoryShiftRepository(db);
    const service = new ShiftService(
      employeeRepo,
      shiftRepo,
      { maxShiftHours: 12, minShiftMinutes: 480, shortShiftGraceMinutes: 0 },
      logger
    );

    await service.handlePhotoMessage({
      user: { id: 102, username: "user2", firstName: "Ольга", lastName: "Петрова", chatId: 102 },
      messageId: 10,
      chatId: 102,
      fileId: "file-start",
      messageDate: new Date("2024-01-01T08:00:00Z")
    });

    const result = await service.handlePhotoMessage({
      user: { id: 102, username: "user2", firstName: "Ольга", lastName: "Петрова", chatId: 102 },
      messageId: 11,
      chatId: 102,
      fileId: "file-end",
      messageDate: new Date("2024-01-01T16:30:00Z")
    });

    expect(result.type).toBe("closed");
    if (result.type === "closed") {
      expect(result.shift.endPhotoFileId).toBe("file-end");
      expect(result.shift.closedReason).toBeDefined();
      expect(result.durationMinutes).toBe(510);
    }
  });

  it("does not create short shift violation for short shift", async () => {
    const db = new InMemoryDatabase();
    const employeeRepo = new InMemoryEmployeeRepository(db);
    const shiftRepo = new InMemoryShiftRepository(db);
    const service = new ShiftService(
      employeeRepo,
      shiftRepo,
      { maxShiftHours: 12, minShiftMinutes: 480, shortShiftGraceMinutes: 0 },
      logger
    );

    await service.handlePhotoMessage({
      user: { id: 110, username: "user10", firstName: "Алия", lastName: "Тест", chatId: 110 },
      messageId: 20,
      chatId: 110,
      fileId: "file-start",
      messageDate: new Date("2024-01-01T08:00:00Z")
    });

    await service.handlePhotoMessage({
      user: { id: 110, username: "user10", firstName: "Алия", lastName: "Тест", chatId: 110 },
      messageId: 21,
      chatId: 110,
      fileId: "file-end",
      messageDate: new Date("2024-01-01T08:05:00Z")
    });

    expect(db.violations).toHaveLength(0);
  });

  it("does not create short shift violation for 9-hour shift", async () => {
    const db = new InMemoryDatabase();
    const employeeRepo = new InMemoryEmployeeRepository(db);
    const shiftRepo = new InMemoryShiftRepository(db);
    const service = new ShiftService(
      employeeRepo,
      shiftRepo,
      { maxShiftHours: 12, minShiftMinutes: 480, shortShiftGraceMinutes: 0 },
      logger
    );

    await service.handlePhotoMessage({
      user: { id: 111, username: "user11", firstName: "Алена", lastName: "Тест", chatId: 111 },
      messageId: 30,
      chatId: 111,
      fileId: "file-start",
      messageDate: new Date("2024-01-01T08:00:00Z")
    });

    await service.handlePhotoMessage({
      user: { id: 111, username: "user11", firstName: "Алена", lastName: "Тест", chatId: 111 },
      messageId: 31,
      chatId: 111,
      fileId: "file-end",
      messageDate: new Date("2024-01-01T17:00:00Z")
    });

    expect(db.violations).toHaveLength(0);
  });

  it("auto-closes overdue shifts and is idempotent", async () => {
    const db = new InMemoryDatabase();
    const employeeRepo = new InMemoryEmployeeRepository(db);
    const shiftRepo = new InMemoryShiftRepository(db);
    const service = new ShiftService(
      employeeRepo,
      shiftRepo,
      { maxShiftHours: 12, minShiftMinutes: 480, shortShiftGraceMinutes: 0 },
      logger
    );

    const employee = await employeeRepo.upsertFromTelegram({
      id: 103,
      username: "user3",
      firstName: "Анна",
      lastName: "Смирнова",
      chatId: 103
    });

    const startTime = new Date("2024-01-01T00:00:00Z");
    await shiftRepo.createShiftStart({
      employeeId: employee.id,
      startTime,
      startPhotoFileId: "file-start",
      startMessageId: 100,
      startChatId: "103"
    });

    const now = new Date("2024-01-01T13:00:00Z");
    const firstRun = await service.autoCloseOverdueShifts(now);
    expect(firstRun).toHaveLength(1);
    expect(db.violations).toHaveLength(1);
    expect(db.violations[0].type).toBe(ViolationType.NOT_CLOSED_IN_TIME);

    const secondRun = await service.autoCloseOverdueShifts(now);
    expect(secondRun).toHaveLength(0);
    expect(db.violations).toHaveLength(1);
  });
});
