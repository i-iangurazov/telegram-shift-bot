import { ClosedReason, EmployeeRoleOverride, ViolationType } from "@prisma/client";
import { ReportService } from "../src/services/reportService";
import { InMemoryDatabase, InMemoryEmployeeRepository, InMemoryShiftRepository } from "./helpers/inMemoryDb";

describe("ReportService", () => {
  it("builds employee report with violations", async () => {
    const db = new InMemoryDatabase();
    const employeeRepo = new InMemoryEmployeeRepository(db);
    const shiftRepo = new InMemoryShiftRepository(db);
    const reportService = new ReportService(shiftRepo, employeeRepo);

    const employee = await employeeRepo.upsertFromTelegram({
      id: 201,
      username: "userA",
      firstName: "Сергей",
      lastName: "Иванов",
      chatId: 201
    });
    employee.roleOverride = EmployeeRoleOverride.DEFAULT;

    const shift1 = await shiftRepo.createShiftStart({
      employeeId: employee.id,
      startTime: new Date("2024-01-05T08:00:00Z"),
      startPhotoFileId: "file-1",
      startMessageId: 1,
      startChatId: "201"
    });

    await shiftRepo.closeShiftByUserPhoto({
      shiftId: shift1.id,
      endTime: new Date("2024-01-05T16:00:00Z"),
      endPhotoFileId: "file-2",
      endMessageId: 2,
      endChatId: "201",
      durationMinutes: 480
    });

    const report = await reportService.getEmployeeReport(employee.id, 7, new Date("2024-01-07T00:00:00Z"));
    expect(report).not.toBeNull();
    expect(report?.totalShifts).toBe(1);
    expect(report?.shifts[0].closedReason).toBe(ClosedReason.USER_PHOTO);
    expect(report?.violationsNotClosedInTime).toBe(0);
    expect(report?.violationsShortShift).toBe(0);
    expect(report?.violationsTotal).toBe(0);
  });

  it("builds all employees report summary", async () => {
    const db = new InMemoryDatabase();
    const employeeRepo = new InMemoryEmployeeRepository(db);
    const shiftRepo = new InMemoryShiftRepository(db);
    const reportService = new ReportService(shiftRepo, employeeRepo);

    const employee1 = await employeeRepo.upsertFromTelegram({
      id: 301,
      username: "user1",
      firstName: "Анна",
      lastName: "Казакова",
      chatId: 301
    });
    const employee2 = await employeeRepo.upsertFromTelegram({
      id: 302,
      username: "user2",
      firstName: "Игорь",
      lastName: "Сергеев",
      chatId: 302
    });

    const shift1 = await shiftRepo.createShiftStart({
      employeeId: employee1.id,
      startTime: new Date("2024-01-06T08:00:00Z"),
      startPhotoFileId: "file-1",
      startMessageId: 1,
      startChatId: "301"
    });

    await shiftRepo.closeShiftByUserPhoto({
      shiftId: shift1.id,
      endTime: new Date("2024-01-06T16:00:00Z"),
      endPhotoFileId: "file-2",
      endMessageId: 2,
      endChatId: "301",
      durationMinutes: 480
    });
    await shiftRepo.createViolation(shift1.id, ViolationType.SHORT_SHIFT);

    const shift2 = await shiftRepo.createShiftStart({
      employeeId: employee2.id,
      startTime: new Date("2024-01-06T09:00:00Z"),
      startPhotoFileId: "file-3",
      startMessageId: 3,
      startChatId: "302"
    });

    await shiftRepo.autoCloseShift(
      shift2.id,
      new Date("2024-01-06T21:00:00Z"),
      720,
      new Date("2024-01-06T21:00:00Z")
    );

    const report = await reportService.getAllEmployeesReport(7, new Date("2024-01-07T00:00:00Z"));
    expect(report.totalEmployees).toBe(2);
    expect(report.totalShifts).toBe(2);
    expect(report.violationsNotClosedInTime).toBe(1);
    expect(report.violationsShortShift).toBe(1);
    expect(report.totalViolations).toBe(2);
    expect(report.topEmployees).toHaveLength(2);
  });
});
