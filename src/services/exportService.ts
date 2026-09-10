import ExcelJS from "exceljs";
import { ClosedReason, ViolationType } from "@prisma/client";
import { EmployeeReport, EmployeeShiftRow, EmployeeSummary } from "./reportService";
import { formatDateForFilename, formatDateTime, toExcelLocalDate } from "../utils/time";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export interface ExportFile { filename: string; content: Buffer; mimeType: typeof XLSX_MIME }
export type ExportShift = EmployeeShiftRow & { employeeId: number; telegramUserId: string; displayName: string };
type Period = { from: Date; to: Date };
const navy = "17365D", teal = "DDEEF0", pale = "F2F6FA";
const HEADER = 6;
const dateFormat = "dd.mm.yyyy", timeFormat = "hh:mm", durationFormat = "[h]:mm";
export const closedReasonLabel = (reason: ClosedReason | null): string => ({
  USER_PHOTO: "По фотографии", AUTO_TIMEOUT: "Автоматически по лимиту", AUTO_DAILY: "Ежедневное автозакрытие"
} as Record<string, string>)[reason ?? ""] ?? "";
const violationLabel = (types: ViolationType[]) => types.map(t => ({
  NOT_CLOSED_IN_TIME: "Смена не закрыта вовремя", SHORT_SHIFT: "Короткая смена"
}[t])).join("; ");

function sheet(book: ExcelJS.Workbook, name: string, title: string, period: Period, tz: string, columns: Array<[string, number]>, generatedAt: Date) {
  const s = book.addWorksheet(name, { views: [{ state: "frozen", ySplit: HEADER }],
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `1:${HEADER}` } });
  s.columns = columns.map(([, width]) => ({ width }));
  for (let r = 1; r <= 4; r++) s.mergeCells(r, 1, r, columns.length);
  s.getCell("A1").value = title;
  s.getCell("A1").font = { name: "Calibri", size: 18, bold: true, color: { argb: "FFFFFFFF" } };
  s.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } };
  s.getRow(1).height = 34;
  s.getCell("A2").value = `Период: ${formatDateTime(period.from, tz)} — ${formatDateTime(period.to, tz)}`;
  s.getCell("A3").value = `Сформирован: ${formatDateTime(generatedAt, tz)} · Часовой пояс: ${tz}`;
  s.getCell("A4").value = "Смены учитываются целиком по дате начала. Открытые смены не входят в сумму времени. Длительность — часы:минуты.";
  for (let r = 2; r <= 4; r++) {
    s.getRow(r).font = { name: "Calibri", size: 11, color: { argb: navy } };
    s.getRow(r).height = r === 4 ? 30 : 22;
    s.getCell(r, 1).alignment = { vertical: "middle", wrapText: true };
  }
  s.getRow(HEADER).values = columns.map(([label]) => label);
  s.getRow(HEADER).height = 34;
  s.getRow(HEADER).eachCell(c => {
    c.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  return s;
}
function finish(s: ExcelJS.Worksheet, totals: ExcelJS.CellValue[], formats: Record<number, string>) {
  const lastData = s.rowCount;
  s.autoFilter = { from: { row: HEADER, column: 1 }, to: { row: Math.max(HEADER, lastData), column: s.columnCount } };
  for (let r = HEADER + 1; r <= lastData; r++) {
    const row = s.getRow(r);
    row.height = Math.max(32, Math.min(180, 16 * Math.ceil(String(row.getCell(1).value ?? "").length / 32)));
    row.eachCell({ includeEmpty: true }, (c, col) => {
      c.font = { name: "Calibri", size: 11, color: { argb: navy } };
      c.alignment = { vertical: "middle", horizontal: typeof c.value === "number" ? "right" : "left", wrapText: true };
      if (r % 2) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: pale } };
      c.numFmt = formats[col] ?? (typeof c.value === "string" ? "@" : "0");
    });
  }
  const total = s.addRow(totals);
  total.height = 30;
  for (let col = 1; col <= s.columnCount; col++) {
    const c = total.getCell(col);
    c.font = { name: "Calibri", size: 11, bold: true, color: { argb: navy } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: teal } };
    c.alignment = { vertical: "middle", wrapText: true };
    c.numFmt = formats[col] ?? "0";
    c.border = { top: { style: "thin", color: { argb: navy } } };
  }
}

export class ExportService {
  async buildEmployeeReportXlsx(report: EmployeeReport, tz: string, generatedAt = new Date()): Promise<ExportFile> {
    const shifts = report.shifts.map(s => ({ ...s, employeeId: report.employeeId, telegramUserId: report.telegramUserId, displayName: report.displayName }));
    return this.buildAllEmployeesReportXlsx(report.period, [report], shifts, tz, generatedAt, "Отчёт по сотруднику");
  }

  async buildAllEmployeesReportXlsx(period: Period, employees: EmployeeSummary[], shifts: ExportShift[], tz: string, generatedAt = new Date(), title = "Отчёт по сменам"): Promise<ExportFile> {
    if (shifts.length > 1_048_568 || employees.length > 1_048_568) throw new Error("Отчёт превышает вместимость листа Excel. Выберите меньший период.");
    // Derive the summary from the same detail snapshot so concurrent shifts cannot
    // make the two sheets disagree. Keep an explicitly selected empty employee.
    const grouped = new Map<number, EmployeeSummary>(employees.map(e => [e.employeeId, { ...e,
      totalShifts: 0, totalDurationMinutes: 0, averageDurationMinutes: 0,
      violationsNotClosedInTime: 0, violationsTotal: 0,
      lastShiftStart: null, lastShiftEnd: null, lastShiftClosedReason: null }]));
    const closedCounts = new Map<number, number>();
    for (const s of shifts) {
      const e = grouped.get(s.employeeId) ?? { employeeId: s.employeeId, telegramUserId: s.telegramUserId,
        displayName: s.displayName, totalShifts: 0, totalDurationMinutes: 0, averageDurationMinutes: 0,
        violationsNotClosedInTime: 0, violationsShortShift: 0, violationsTotal: 0 };
      e.totalShifts++; e.totalDurationMinutes += s.durationMinutes ?? 0;
      if (s.durationMinutes != null) closedCounts.set(s.employeeId, (closedCounts.get(s.employeeId) ?? 0) + 1);
      e.violationsNotClosedInTime += s.violations.filter(t => t === ViolationType.NOT_CLOSED_IN_TIME).length;
      e.violationsTotal += s.violations.length;
      if (!e.lastShiftStart || s.startTime > e.lastShiftStart) {
        e.lastShiftStart = s.startTime; e.lastShiftEnd = s.endTime; e.lastShiftClosedReason = s.closedReason;
      }
      grouped.set(s.employeeId, e);
    }
    employees = [...grouped.values()].sort((a, b) => a.displayName.localeCompare(b.displayName, "ru"));
    for (const e of employees) e.averageDurationMinutes = Math.round(e.totalDurationMinutes / (closedCounts.get(e.employeeId) || 1));
    const book = new ExcelJS.Workbook();
    book.creator = "Бот учёта смен"; book.title = title; book.created = generatedAt; book.modified = generatedAt;
    const summary = sheet(book, "Сводка", title, period, tz, [
      ["Сотрудник", 38], ["Количество смен", 14], ["Суммарная длительность", 22], ["Средняя длительность", 22],
      ["Не закрыто вовремя", 18], ["Всего нарушений", 17], ["Последнее начало", 23], ["Последнее окончание", 23],
      ["Способ закрытия", 29], ["Код сотрудника", 17], ["Идентификатор Telegram", 24]
    ], generatedAt);
    for (const e of employees) summary.addRow([
      e.displayName, e.totalShifts, e.totalDurationMinutes / 1440, e.averageDurationMinutes / 1440,
      e.violationsNotClosedInTime, e.violationsTotal, e.lastShiftStart ? toExcelLocalDate(e.lastShiftStart, tz) : null,
      e.lastShiftEnd ? toExcelLocalDate(e.lastShiftEnd, tz) : null, closedReasonLabel(e.lastShiftClosedReason ?? null), String(e.employeeId), e.telegramUserId
    ]);
    const sum = (key: "totalShifts" | "totalDurationMinutes" | "violationsNotClosedInTime" | "violationsTotal") => employees.reduce((n, e) => n + e[key], 0);
    finish(summary, ["ИТОГО", sum("totalShifts"), sum("totalDurationMinutes") / 1440, null, sum("violationsNotClosedInTime"), sum("violationsTotal")], { 3: durationFormat, 4: durationFormat, 7: `${dateFormat} ${timeFormat}`, 8: `${dateFormat} ${timeFormat}` });
    const detail = sheet(book, "Смены", "Подробные смены", period, tz, [
      ["Сотрудник", 38], ["Дата начала", 15], ["Время начала", 14], ["Дата окончания", 16], ["Время окончания", 16],
      ["Длительность", 17], ["Способ закрытия", 29], ["Статус", 15], ["Нарушения", 32], ["Минуты", 12],
      ["Не закрыто вовремя", 18], ["Всего нарушений", 17], ["Код смены", 15], ["Код сотрудника", 17], ["Идентификатор Telegram", 24],
      ["Чат фото начала", 22], ["Сообщение фото начала", 22], ["Чат фото окончания", 22], ["Сообщение фото окончания", 24]
    ], generatedAt);
    let minutes = 0, notClosed = 0, violations = 0;
    for (const s of shifts) {
      const start = toExcelLocalDate(s.startTime, tz), end = s.endTime ? toExcelLocalDate(s.endTime, tz) : null;
      const count = s.violations.filter(t => t === ViolationType.NOT_CLOSED_IN_TIME).length;
      minutes += s.durationMinutes ?? 0; notClosed += count; violations += s.violations.length;
      detail.addRow([s.displayName, start, start, end, end, s.durationMinutes === null ? null : s.durationMinutes / 1440,
        closedReasonLabel(s.closedReason), s.endTime ? "Закрыта" : "Открыта", violationLabel(s.violations), s.durationMinutes,
        count, s.violations.length, s.id === undefined ? null : String(s.id), String(s.employeeId), s.telegramUserId,
        s.startChatId ?? null, s.startMessageId === undefined ? null : String(s.startMessageId), s.endChatId ?? null,
        s.endMessageId == null ? null : String(s.endMessageId)]);
    }
    finish(detail, [`ИТОГО: ${shifts.length} смен`, null, null, null, null, minutes / 1440, null, null, null, minutes, notClosed, violations],
      { 2: dateFormat, 3: timeFormat, 4: dateFormat, 5: timeFormat, 6: durationFormat });
    const content = Buffer.from(await book.xlsx.writeBuffer());
    return { filename: `Отчёт_по_сменам_${formatDateForFilename(period.from, tz)}_${formatDateForFilename(period.to, tz)}.xlsx`, content, mimeType: XLSX_MIME };
  }
}
