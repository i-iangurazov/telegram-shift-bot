import ExcelJS from "exceljs";
import { ExportService, XLSX_MIME, ExportShift } from "../src/services/exportService";
const service = new ExportService();
const period = { from: new Date("2025-12-31T18:00:00Z"), to: new Date("2026-01-31T17:59:59.999Z") };
const shift: ExportShift = { id: 1, employeeId: 1, telegramUserId: "9007199254740993", displayName: '=Иван, "Иванов"\n' + "Очень длинное имя ".repeat(6), startTime: new Date("2026-01-01T02:57:43Z"), endTime: new Date("2026-01-01T12:03:21Z"), durationMinutes: 546, closedReason: "USER_PHOTO", violations: [], startChatId: "9007199254740993", startMessageId: 100, endChatId: "9007199254740993", endMessageId: 101 };
const employee = { employeeId: 1, telegramUserId: shift.telegramUserId, displayName: shift.displayName, totalShifts: 4, totalDurationMinutes: 2184, averageDurationMinutes: 546, violationsNotClosedInTime: 0, violationsShortShift: 0, violationsTotal: 0 };

test("real XLSX retains typed local dates, seconds, text identifiers, >24h totals and safe names", async () => {
  const file = await service.buildAllEmployeesReportXlsx(period, [employee], Array.from({ length: 4 }, () => shift), "Asia/Bishkek");
  expect(file.mimeType).toBe(XLSX_MIME); expect(file.filename).toMatch(/^Отчёт.*\.xlsx$/);
  expect(file.content.subarray(0, 2).toString()).toBe("PK");
  const book = new ExcelJS.Workbook(); await book.xlsx.load(file.content as any);
  expect(book.worksheets.map(s => s.name)).toEqual(["Сводка", "Смены"]);
  const detail = book.getWorksheet("Смены")!;
  expect(detail.getCell("A7").type).toBe(ExcelJS.ValueType.String);
  expect(detail.getCell("A7").value).toBe(shift.displayName);
  expect(detail.getCell("B7").value).toEqual(new Date("2026-01-01T08:57:43Z"));
  expect(detail.getCell("C7").numFmt).toBe("hh:mm");
  expect(detail.getCell("E7").value).toEqual(new Date("2026-01-01T18:03:21Z"));
  expect((detail.getCell("F11").value as Date).getTime() / 86400000 + 25569).toBeCloseTo(2184 / 1440, 8);
  expect(detail.getCell("F11").numFmt).toBe("[h]:mm");
  expect(detail.getCell("O7").type).toBe(ExcelJS.ValueType.String);
  expect(detail.views[0]).toMatchObject({ state: "frozen", ySplit: 6 });
  expect(detail.autoFilter).toBeTruthy();
});

test("empty and open reports contain blank endings and valid totals", async () => {
  for (const shifts of [[], [{ ...shift, endTime: null, durationMinutes: null, closedReason: null }]]) {
    const file = await service.buildAllEmployeesReportXlsx(period, [], shifts, "Asia/Bishkek");
    const book = new ExcelJS.Workbook(); await book.xlsx.load(file.content as any);
    const detail = book.getWorksheet("Смены")!;
    expect(detail.rowCount).toBe(shifts.length + 7);
    if (shifts.length) { expect(detail.getCell("D7").value).toBeNull(); expect(detail.getCell("H7").value).toBe("Открыта"); }
  }
});

test("large XLSX includes every detail row beyond old export limits", async () => {
  const file = await service.buildAllEmployeesReportXlsx(period, [], Array.from({ length: 10005 }, (_, i) => ({ ...shift, id: i + 1 })), "Asia/Bishkek");
  const book = new ExcelJS.Workbook(); await book.xlsx.load(file.content as any);
  const s = book.getWorksheet("Смены")!;
  expect(s.rowCount).toBe(10012); expect(s.getCell("M10011").value).toBe("10005");
  expect(s.getCell("J10012").value).toBe(10005 * 546);
});
