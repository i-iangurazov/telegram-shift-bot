import { ClosedReason, EmployeeRoleOverride } from "@prisma/client";
import { buildEmployeeListKeyboard, buildAllPeriodKeyboard } from "../src/bot/keyboards/adminReportKeyboards";
import { buildEmployeeReportMessage, buildAllEmployeesReportMessage } from "../src/bot/formatters/adminReportFormatter";
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
      shifts: [
        {
          startTime: new Date("2024-01-01T08:00:00Z"),
          endTime: new Date("2024-01-01T16:00:00Z"),
          durationMinutes: 480,
          closedReason: ClosedReason.USER_PHOTO,
          violations: []
        }
      ]
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

  it("period keyboard exists for all employees", () => {
    const keyboard = buildAllPeriodKeyboard();
    expect(keyboard.reply_markup.inline_keyboard.flat().length).toBeGreaterThan(0);
  });
});
