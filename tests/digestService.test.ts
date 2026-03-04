import { ViolationType } from "@prisma/client";
import { buildDailyDigestMessage, buildWeeklyDigestMessage } from "../src/bot/formatters/digestFormatter";
import { DigestService, parseDigestDateKey } from "../src/services/digestService";
import { InMemoryDatabase, InMemoryEmployeeRepository, InMemoryShiftRepository } from "./helpers/inMemoryDb";

describe("DigestService", () => {
  it("builds daily digest with start/end per employee and totals", async () => {
    const db = new InMemoryDatabase();
    const employeeRepo = new InMemoryEmployeeRepository(db);
    const shiftRepo = new InMemoryShiftRepository(db);
    const digestService = new DigestService(shiftRepo);

    const employee1 = await employeeRepo.upsertFromTelegram({
      id: 1001,
      username: "a1",
      firstName: "Анна",
      lastName: "Ким",
      chatId: 1001
    });
    const employee2 = await employeeRepo.upsertFromTelegram({
      id: 1002,
      username: "b1",
      firstName: "Бек",
      lastName: "Исаев",
      chatId: 1002
    });

    const shift1 = await shiftRepo.createShiftStart({
      employeeId: employee1.id,
      startTime: new Date("2024-01-10T02:00:00Z"), // 08:00 Asia/Bishkek
      startPhotoFileId: "s1",
      startMessageId: 1,
      startChatId: "1001"
    });
    await shiftRepo.closeShiftByUserPhoto({
      shiftId: shift1.id,
      endTime: new Date("2024-01-10T06:00:00Z"), // 12:00 Asia/Bishkek
      endPhotoFileId: "e1",
      endMessageId: 2,
      endChatId: "1001",
      durationMinutes: 240
    });

    const shift2 = await shiftRepo.createShiftStart({
      employeeId: employee1.id,
      startTime: new Date("2024-01-10T09:30:00Z"), // 15:30 Asia/Bishkek
      startPhotoFileId: "s2",
      startMessageId: 3,
      startChatId: "1001"
    });
    await shiftRepo.closeShiftByUserPhoto({
      shiftId: shift2.id,
      endTime: new Date("2024-01-10T12:00:00Z"), // 18:00 Asia/Bishkek
      endPhotoFileId: "e2",
      endMessageId: 4,
      endChatId: "1001",
      durationMinutes: 150
    });
    await shiftRepo.createViolation(shift2.id, ViolationType.NOT_CLOSED_IN_TIME);

    await shiftRepo.createShiftStart({
      employeeId: employee2.id,
      startTime: new Date("2024-01-10T04:15:00Z"), // 10:15 Asia/Bishkek
      startPhotoFileId: "s3",
      startMessageId: 5,
      startChatId: "1002"
    });

    const report = await digestService.getDailyDigestReport({
      timezone: "Asia/Bishkek",
      date: parseDigestDateKey("2024-01-10", "Asia/Bishkek") ?? undefined
    });

    expect(report.totals.totalEmployees).toBe(2);
    expect(report.totals.totalShifts).toBe(3);
    expect(report.totals.totalDurationMinutes).toBe(390);
    expect(report.totals.violationsNotClosedInTime).toBe(1);
    expect(report.totals.notClosedEmployees).toBe(1);

    const message = buildDailyDigestMessage(report);
    expect(message).toContain("Дневной отчёт");
    expect(message).toContain("Анна Ким");
    expect(message).toContain("Бек Исаев");
    expect(message).toContain("старт: 08:00");
    expect(message).toContain("финиш: 18:00");
    expect(message).toContain("финиш: не закрыл");
    expect(message).toContain("Итого: сотрудников 2, смен 3");
  });

  it("builds weekly digest with aggregated totals and last shift", async () => {
    const db = new InMemoryDatabase();
    const employeeRepo = new InMemoryEmployeeRepository(db);
    const shiftRepo = new InMemoryShiftRepository(db);
    const digestService = new DigestService(shiftRepo);

    const employee1 = await employeeRepo.upsertFromTelegram({
      id: 2001,
      username: "c1",
      firstName: "Сергей",
      lastName: "Орлов",
      chatId: 2001
    });
    const employee2 = await employeeRepo.upsertFromTelegram({
      id: 2002,
      username: "d1",
      firstName: "Мария",
      lastName: "Токтобаева",
      chatId: 2002
    });

    const shift1 = await shiftRepo.createShiftStart({
      employeeId: employee1.id,
      startTime: new Date("2024-01-08T03:00:00Z"),
      startPhotoFileId: "w1",
      startMessageId: 1,
      startChatId: "2001"
    });
    await shiftRepo.closeShiftByUserPhoto({
      shiftId: shift1.id,
      endTime: new Date("2024-01-08T11:00:00Z"),
      endPhotoFileId: "w2",
      endMessageId: 2,
      endChatId: "2001",
      durationMinutes: 480
    });

    const shift2 = await shiftRepo.createShiftStart({
      employeeId: employee1.id,
      startTime: new Date("2024-01-11T04:00:00Z"),
      startPhotoFileId: "w3",
      startMessageId: 3,
      startChatId: "2001"
    });
    await shiftRepo.closeShiftByUserPhoto({
      shiftId: shift2.id,
      endTime: new Date("2024-01-11T09:00:00Z"),
      endPhotoFileId: "w4",
      endMessageId: 4,
      endChatId: "2001",
      durationMinutes: 300
    });
    await shiftRepo.createViolation(shift2.id, ViolationType.NOT_CLOSED_IN_TIME);

    const shift3 = await shiftRepo.createShiftStart({
      employeeId: employee2.id,
      startTime: new Date("2024-01-09T04:00:00Z"),
      startPhotoFileId: "w5",
      startMessageId: 5,
      startChatId: "2002"
    });
    await shiftRepo.closeShiftByUserPhoto({
      shiftId: shift3.id,
      endTime: new Date("2024-01-09T06:00:00Z"),
      endPhotoFileId: "w6",
      endMessageId: 6,
      endChatId: "2002",
      durationMinutes: 120
    });

    await shiftRepo.createShiftStart({
      employeeId: employee2.id,
      startTime: new Date("2024-01-12T05:00:00Z"),
      startPhotoFileId: "w7",
      startMessageId: 7,
      startChatId: "2002"
    });

    const report = await digestService.getWeeklyDigestReport({
      timezone: "Asia/Bishkek",
      now: new Date("2024-01-12T12:00:00Z"),
      days: 7
    });

    expect(report.totals.totalEmployees).toBe(2);
    expect(report.totals.totalShifts).toBe(4);
    expect(report.totals.totalDurationMinutes).toBe(900);
    expect(report.totals.violationsNotClosedInTime).toBe(1);

    const sergey = report.employees.find((employee) => employee.displayName === "Сергей Орлов");
    const maria = report.employees.find((employee) => employee.displayName === "Мария Токтобаева");
    expect(sergey?.shiftsCount).toBe(2);
    expect(sergey?.totalDurationMinutes).toBe(780);
    expect(sergey?.violationsNotClosedInTime).toBe(1);
    expect(maria?.shiftsCount).toBe(2);
    expect(maria?.totalDurationMinutes).toBe(120);
    expect(maria?.lastShiftEnd).toBeNull();

    const message = buildWeeklyDigestMessage(report);
    expect(message).toContain("Еженедельный отчёт");
    expect(message).toContain("последняя:");
    expect(message).toContain("Мария Токтобаева");
    expect(message).toContain("Итого: сотрудников 2, смен 4");
  });
});
