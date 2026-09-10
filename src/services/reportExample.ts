import { ExportService, ExportShift } from "./exportService";

export const buildExampleReport = (timezone: string) => {
  const shifts: ExportShift[] = [
    { id: 1, employeeId: 1, telegramUserId: "9007199254740993", displayName: "Анна Иванова", startTime: new Date("2026-01-01T02:57:43Z"), endTime: new Date("2026-01-01T12:03:21Z"), durationMinutes: 546, closedReason: "USER_PHOTO", violations: [] },
    { id: 2, employeeId: 1, telegramUserId: "9007199254740993", displayName: "Анна Иванова", startTime: new Date("2026-01-02T02:55:00Z"), endTime: new Date("2026-01-02T14:55:00Z"), durationMinutes: 720, closedReason: "AUTO_TIMEOUT", violations: ["NOT_CLOSED_IN_TIME"] },
    { id: 3, employeeId: 1, telegramUserId: "9007199254740993", displayName: "Анна Иванова", startTime: new Date("2026-01-03T02:58:00Z"), endTime: new Date("2026-01-03T12:00:00Z"), durationMinutes: 542, closedReason: "AUTO_DAILY", violations: [] },
    { id: 4, employeeId: 2, telegramUserId: "8000000000000001", displayName: "Бакыт Абдрахманов", startTime: new Date("2026-01-03T16:00:00Z"), endTime: new Date("2026-01-04T02:00:00Z"), durationMinutes: 600, closedReason: "USER_PHOTO", violations: [] },
    { id: 5, employeeId: 3, telegramUserId: "8000000000000002", displayName: "Екатерина Александровна Константинопольская", startTime: new Date("2026-01-04T03:01:08Z"), endTime: null, durationMinutes: null, closedReason: null, violations: [] },
    { id: 6, employeeId: 4, telegramUserId: "8000000000000003", displayName: "=Текст, а не формула", startTime: new Date("2026-01-04T03:00:00Z"), endTime: new Date("2026-01-04T12:00:00Z"), durationMinutes: 540, closedReason: "AUTO_DAILY", violations: [] }
  ];
  return new ExportService().buildAllEmployeesReportXlsx({ from: new Date("2025-12-31T18:00:00Z"), to: new Date("2026-01-04T17:59:59.999Z") }, [], shifts, timezone, new Date("2026-01-04T13:00:00Z"), "Пример отчёта · тестовые данные");
};
