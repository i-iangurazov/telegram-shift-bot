import { ClosedReason, EmployeeRoleOverride } from "@prisma/client";
import { buildEmployeeListKeyboard, buildAllPeriodKeyboard, buildEmployeeReportPaginationKeyboard } from "../src/bot/keyboards/adminReportKeyboards";
import { buildEmployeeReportMessage, buildAllEmployeesReportMessage } from "../src/bot/formatters/adminReportFormatter";
import { adminKeyboard } from "../src/bot/keyboards/roleKeyboards";
import { messages } from "../src/bot/messages";

const sampleEmployee = {
  id: 1,
  telegramUserId: "1",
  username: "user",
  firstName: "Иван",
  lastName: "Иванов",
  displayName: "Иван Иванов",
  isActive: true,
  roleOverride: EmployeeRoleOverride.DEFAULT
};

describe("Admin flows UI", () => {
  const buildShiftRows = (count: number) => Array.from({ length: count }, (_, index) => ({
    startTime: new Date(`2024-01-0${(index % 9) + 1}T08:00:00Z`),
    endTime: new Date(`2024-01-0${(index % 9) + 1}T16:00:00Z`),
    durationMinutes: 480,
    closedReason: ClosedReason.USER_PHOTO,
    violations: []
  }));

  it("employees picker has search and back buttons", () => {
    const keyboard = buildEmployeeListKeyboard({
      employees: [sampleEmployee],
      page: 1,
      totalPages: 1,
      query: ""
    });

    const inlineKeyboard = keyboard.reply_markup.inline_keyboard.flat();
    const labels = inlineKeyboard.map((button) => button.text);
    expect(labels).toContain("Поиск");
    expect(labels).toContain("Назад");
    expect(labels).toContain("Иван Иванов");
  });

  it("admin keyboard includes digest buttons", () => {
    const labels = adminKeyboard.reply_markup.keyboard.flat().map((button) => {
      return typeof button === "string" ? button : button.text;
    });

    expect(labels).toContain("Дневной отчёт");
    expect(labels).toContain("Еженедельный отчёт");
    expect(labels).toContain("Настроить рассылку");
  });

  it("employees and report prompts are different", () => {
    expect(messages.employeesChoosePrompt).not.toBe(messages.reportAllPrompt);
  });

  it("report messages are generated for employee and all", () => {
    const employeeReport = buildEmployeeReportMessage({
      employeeId: 1,
      telegramUserId: "1",
      displayName: "Иван Иванов",
      period: { from: new Date("2024-01-01T00:00:00Z"), to: new Date("2024-01-02T00:00:00Z"), days: 1 },
      totalShifts: 1,
      totalDurationMinutes: 480,
      averageDurationMinutes: 480,
      violationsNotClosedInTime: 0,
      violationsShortShift: 0,
      violationsTotal: 0,
      summary: {
        totalShifts: 1,
        totalDurationMinutes: 480,
        averageDurationMinutes: 480,
        violationsNotClosedInTime: 0,
        violationsShortShift: 0,
        violationsTotal: 0
      },
      shifts: [
        {
          startTime: new Date("2024-01-01T08:00:00Z"),
          endTime: new Date("2024-01-01T16:00:00Z"),
          durationMinutes: 480,
          closedReason: ClosedReason.USER_PHOTO,
          violations: []
        }
      ],
      page: 0,
      pageSize: 10
    }, "Asia/Bishkek");

    const allReport = buildAllEmployeesReportMessage({
      period: { from: new Date("2024-01-01T00:00:00Z"), to: new Date("2024-01-02T00:00:00Z"), days: 1 },
      totalEmployees: 1,
      totalShifts: 1,
      totalDurationMinutes: 480,
      violationsNotClosedInTime: 0,
      violationsShortShift: 0,
      totalViolations: 0,
      employees: [
        {
          employeeId: 1,
          telegramUserId: "1",
          displayName: "Иван Иванов",
          totalShifts: 1,
          totalDurationMinutes: 480,
          averageDurationMinutes: 480,
          violationsNotClosedInTime: 0,
          violationsShortShift: 0,
          violationsTotal: 0
        }
      ],
      topEmployees: [
        {
          employeeId: 1,
          telegramUserId: "1",
          displayName: "Иван Иванов",
          totalShifts: 1,
          totalDurationMinutes: 480,
          averageDurationMinutes: 480,
          violationsNotClosedInTime: 0,
          violationsShortShift: 0,
          violationsTotal: 0
        }
      ]
    }, "Asia/Bishkek");

    expect(employeeReport).toContain("Отчёт по сотруднику");
    expect(employeeReport).toContain("Нарушения: нет");
    expect(employeeReport).not.toContain("✅");
    expect(allReport).toContain("Сводный отчёт");
  });

  it("employee report header uses plain label when shifts <= 10", () => {
    const report = buildEmployeeReportMessage({
      employeeId: 2,
      telegramUserId: "2",
      displayName: "Пётр Петров",
      period: { from: new Date("2024-01-01T00:00:00Z"), to: new Date("2024-01-03T00:00:00Z"), days: 2 },
      totalShifts: 2,
      totalDurationMinutes: 960,
      averageDurationMinutes: 480,
      violationsNotClosedInTime: 0,
      violationsShortShift: 0,
      violationsTotal: 0,
      summary: {
        totalShifts: 2,
        totalDurationMinutes: 960,
        averageDurationMinutes: 480,
        violationsNotClosedInTime: 0,
        violationsShortShift: 0,
        violationsTotal: 0
      },
      shifts: buildShiftRows(2),
      page: 0,
      pageSize: 10
    }, "Asia/Bishkek");

    expect(report).toContain("Смены:");
    expect(report).not.toContain("последние 10 из");
  });

  it("employee report header shows last 10 of total when shifts > 10", () => {
    const report = buildEmployeeReportMessage({
      employeeId: 3,
      telegramUserId: "3",
      displayName: "Анна Иванова",
      period: { from: new Date("2024-01-01T00:00:00Z"), to: new Date("2024-01-31T00:00:00Z"), days: 30 },
      totalShifts: 12,
      totalDurationMinutes: 5760,
      averageDurationMinutes: 480,
      violationsNotClosedInTime: 1,
      violationsShortShift: 0,
      violationsTotal: 1,
      summary: {
        totalShifts: 12,
        totalDurationMinutes: 5760,
        averageDurationMinutes: 480,
        violationsNotClosedInTime: 1,
        violationsShortShift: 0,
        violationsTotal: 1
      },
      shifts: buildShiftRows(10),
      page: 0,
      pageSize: 10
    }, "Asia/Bishkek");

    expect(report).toContain("Смены (показаны 1-10 из 12):");
  });

  it("employee report header reflects second page range", () => {
    const report = buildEmployeeReportMessage({
      employeeId: 4,
      telegramUserId: "4",
      displayName: "Светлана Петрова",
      period: { from: new Date("2024-01-01T00:00:00Z"), to: new Date("2024-01-31T00:00:00Z"), days: 30 },
      totalShifts: 12,
      totalDurationMinutes: 5760,
      averageDurationMinutes: 480,
      violationsNotClosedInTime: 0,
      violationsShortShift: 0,
      violationsTotal: 0,
      summary: {
        totalShifts: 12,
        totalDurationMinutes: 5760,
        averageDurationMinutes: 480,
        violationsNotClosedInTime: 0,
        violationsShortShift: 0,
        violationsTotal: 0
      },
      shifts: buildShiftRows(2),
      page: 1,
      pageSize: 10
    }, "Asia/Bishkek");

    expect(report).toContain("Смены (показаны 11-12 из 12):");
  });

  it("period keyboard exists for all employees", () => {
    const keyboard = buildAllPeriodKeyboard();
    const labels = keyboard.reply_markup.inline_keyboard.flat().map((button) => button.text);
    expect(labels).toContain("Этот месяц");
    expect(labels).toContain("Прошлый месяц");
    expect(labels).toContain("За 12 месяцев");
  });

  it("pagination keyboard shows next only on first page", () => {
    const keyboard = buildEmployeeReportPaginationKeyboard({
      employeeId: 10,
      periodKey: "30d",
      page: 0,
      pageSize: 10,
      totalShifts: 12
    });

    const labels = keyboard.reply_markup.inline_keyboard.flat().map((button) => button.text);
    expect(labels).toContain("➡️ Далее");
    expect(labels).toContain("📄 Экспорт");
    expect(labels).not.toContain("⬅️ Назад");
  });

  it("pagination keyboard shows back only on last page", () => {
    const keyboard = buildEmployeeReportPaginationKeyboard({
      employeeId: 10,
      periodKey: "30d",
      page: 1,
      pageSize: 10,
      totalShifts: 12
    });

    const labels = keyboard.reply_markup.inline_keyboard.flat().map((button) => button.text);
    expect(labels).toContain("⬅️ Назад");
    expect(labels).toContain("📄 Экспорт");
    expect(labels).not.toContain("➡️ Далее");
  });

  it("pagination keyboard hides back/next when total <= page size", () => {
    const keyboard = buildEmployeeReportPaginationKeyboard({
      employeeId: 10,
      periodKey: "7d",
      page: 0,
      pageSize: 10,
      totalShifts: 2
    });

    const labels = keyboard.reply_markup.inline_keyboard.flat().map((button) => button.text);
    expect(labels).toEqual(["📄 Экспорт"]);
  });
});
