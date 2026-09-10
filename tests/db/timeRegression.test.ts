import ExcelJS from "exceljs";
import { prisma } from "../../src/db/prisma";
import { resetDb, disconnectDb } from "../helpers/createTestDb";
import { buildDeps } from "../helpers/buildDeps";
import { createBot } from "../../src/bot/bot";
import { attachFakeTelegram } from "../helpers/fakeTelegram";
import { makePhotoUpdate, makeCallbackUpdate } from "../helpers/makeUpdate";
import { systemClock } from "../../src/server/clock";
import { updateContext } from "../../src/server/updateContext";
import { buildEmployeeReportMessage } from "../../src/bot/formatters/adminReportFormatter";
import { PendingActionService } from "../../src/services/pendingActionService";
import { resolveReportPeriodRange } from "../../src/bot/reports/reportPeriods";
import { getDailyCloseEndTimeForShift } from "../../src/utils/time";

beforeEach(resetDb);
afterEach(() => jest.restoreAllMocks());
afterAll(disconnectDb);
const user = { id: 811, firstName: "Тестовый", lastName: "Сотрудник", chatId: 811 };
const photo = (messageId: number, messageDate: Date, receivedAt = messageDate) => ({ user, messageId, chatId: 811, fileId: `test-${messageId}`, messageDate, receivedAt });

async function setup() {
  const d = buildDeps(); const bot = createBot(d);
  bot.botInfo = { id: 123, is_bot: true, first_name: "Test", username: "test_bot", can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false };
  const fake = attachFakeTelegram(bot); return { ...d, bot, fake };
}

test("photo → late webhook/prompt → delayed confirmation → PostgreSQL → Telegram report → XLSX preserves exact source seconds", async () => {
  const d = await setup();
  let processed = new Date("2026-09-10T03:00:00Z");
  jest.spyOn(systemClock, "now").mockImplementation(() => processed);
  const start = new Date("2026-09-10T02:57:43Z");
  await d.bot.handleUpdate(makePhotoUpdate({ updateId: 1, chatId: 811, fromId: 811, messageId: 10, date: start.getTime() / 1000 }) as any);
  const pending = await prisma.pendingAction.findFirstOrThrow();
  expect(pending.createdAt).toEqual(start);
  expect(pending.expiresAt).toEqual(new Date("2026-09-10T03:10:00Z"));
  // Worker runs after expiry; persisted callback arrival was within the window.
  processed = new Date("2026-09-10T03:20:00Z");
  await d.pendingActionService.expirePendingActions(processed);
  await updateContext.run({ receivedAt: new Date("2026-09-10T03:01:00Z"), updateId: 2 }, () => d.bot.handleUpdate(makeCallbackUpdate({ updateId: 2, chatId: 811, fromId: 811, data: `pending_confirm:${pending.id}` }) as any));
  const end = new Date("2026-09-10T12:03:21Z"); processed = new Date("2026-09-10T12:07:00Z");
  await d.bot.handleUpdate(makePhotoUpdate({ updateId: 3, chatId: 811, fromId: 811, messageId: 11, date: end.getTime() / 1000 }) as any);
  const endPending = await prisma.pendingAction.findFirstOrThrow({ where: { actionType: "END" } });
  await d.bot.handleUpdate(makeCallbackUpdate({ updateId: 4, chatId: 811, fromId: 811, data: `pending_confirm:${endPending.id}` }) as any);
  const stored = await prisma.shift.findFirstOrThrow(); expect(stored.startTime).toEqual(start); expect(stored.endTime).toEqual(end); expect(stored.startMessageId).toBe(10); expect(stored.endMessageId).toBe(11);
  const report = (await d.reportService.getEmployeeReport(stored.employeeId, { from: new Date("2026-09-09T18:00:00Z"), to: new Date("2026-09-10T17:59:59.999Z") }))!;
  const message = buildEmployeeReportMessage(report, "Asia/Bishkek"); expect(message).toContain("08:57–18:03");
  expect(d.fake.getMessages().some(c => c.payload.text.includes("08:57"))).toBe(true);
  const file = await d.exportService.buildEmployeeReportXlsx(report, "Asia/Bishkek");
  const book = new ExcelJS.Workbook(); await book.xlsx.load(file.content as any); expect(book.getWorksheet("Смены")!.getCell("C7").value).toEqual(new Date("2026-09-10T08:57:43Z"));
});

test.each([false, true])("on-time end photo wins timeout before/after receipt (workerFirst=%s)", async workerFirst => {
  const d = buildDeps(); const start = new Date("2026-01-01T00:00:00Z"), end = new Date("2026-01-01T11:59:42Z");
  const a = await d.pendingActionService.createFromPhoto(photo(1, start)); if (a.type !== "pending") throw Error();
  await d.pendingActionService.confirmAction(a.pendingAction.id, "811", new Date(start.getTime() + 1000));
  const run = () => d.shiftService.autoCloseOverdueShifts(new Date("2026-01-01T12:05:00Z"));
  if (workerFirst) await run();
  const b = await d.pendingActionService.createFromPhoto(photo(2, end, new Date("2026-01-01T12:06:00Z"))); if (b.type !== "pending") throw Error();
  expect(b.actionType).toBe("END"); if (!workerFirst) await run();
  const result = await d.pendingActionService.confirmAction(b.pendingAction.id, "811", new Date("2026-01-01T12:07:00Z"));
  expect(result.type).toBe("confirmed_end");
  const shift = await prisma.shift.findFirstOrThrow(); expect(shift.endTime).toEqual(end); expect(shift.closedReason).toBe("USER_PHOTO"); expect(await prisma.shiftViolation.count()).toBe(0);
  await d.pendingActionService.confirmAction(b.pendingAction.id, "811", new Date("2026-01-01T12:08:00Z")); expect(await prisma.shift.count()).toBe(1);
});

test("bound end photo cannot close a newer shift", async () => {
  const d = buildDeps(); const a = await d.pendingActionService.createFromPhoto(photo(1, new Date("2026-01-01T00:00:00Z"))); if (a.type !== "pending") throw Error();
  await d.pendingActionService.confirmAction(a.pendingAction.id, "811", new Date("2026-01-01T00:01:00Z"));
  const b = await d.pendingActionService.createFromPhoto(photo(2, new Date("2026-01-01T11:59:00Z"))); if (b.type !== "pending") throw Error();
  await d.shiftService.autoCloseOverdueShifts(new Date("2026-01-01T12:01:00Z"));
  const c = await d.pendingActionService.createFromPhoto(photo(3, new Date("2026-01-01T12:02:00Z"))); if (c.type !== "pending") throw Error();
  await d.pendingActionService.confirmAction(c.pendingAction.id, "811", new Date("2026-01-01T12:03:00Z"));
  await d.pendingActionService.confirmAction(b.pendingAction.id, "811", new Date("2026-01-01T12:04:00Z"));
  const shifts = await prisma.shift.findMany({ orderBy: { id: "asc" } }); expect(shifts[0].endTime).toEqual(new Date("2026-01-01T11:59:00Z")); expect(shifts[1].endTime).toBeNull();
});

test("daily profile keeps photo time around 18:00, closes at local schedule and never closes manually", async () => {
  const d = buildDeps(); const service = new PendingActionService(d.employeeRepo, d.shiftRepo, d.pendingActionRepo, { ttlMinutes: 10, maxShiftHours: 12, minShiftMinutes: 480, shortShiftGraceMinutes: 0, profile: "start_only_daily_close", dailyAutoClose: { timezone: "Asia/Bishkek", closeTime: "18:00" } }, fn => prisma.$transaction(tx => fn(tx)));
  const start = new Date("2026-12-31T11:59:42Z");
  const a = await service.createFromPhoto(photo(1, start, new Date("2026-12-31T12:02:00Z"))); if (a.type !== "pending") throw Error();
  await service.confirmAction(a.pendingAction.id, "811", new Date("2026-12-31T12:03:00Z"));
  await d.shiftService.dailyAutoCloseOpenShifts({ timezone: "Asia/Bishkek", closeTime: "18:00" }, new Date("2027-01-01T04:00:00Z"));
  const shift = await prisma.shift.findFirstOrThrow(); expect(shift.startTime).toEqual(start); expect(shift.endTime).toEqual(new Date("2026-12-31T12:00:00Z")); expect(shift.closedReason).toBe("AUTO_DAILY");
  const b = await service.createFromPhoto(photo(2, new Date("2026-12-31T11:59:50Z"))); expect(b.type).toBe("open_shift_exists");
  expect(getDailyCloseEndTimeForShift(new Date("2026-12-31T12:00:01Z"), "Asia/Bishkek", "18:00")).toEqual(new Date("2027-01-01T12:00:00Z"));
});

test("ORM and raw SQL agree on month/year boundaries under a non-UTC database timezone", async () => {
  const d = buildDeps(); const e = await d.employeeRepo.upsertFromTelegram(user);
  const boundary = new Date("2025-12-31T18:00:00Z");
  for (const [i, date] of [new Date(boundary.getTime() - 1), boundary, new Date("2026-01-31T17:59:59.999Z"), new Date("2026-01-31T18:00:00Z")].entries()) {
    await prisma.shift.create({ data: { employeeId: e.id, startTime: date, startChatId: "811", startMessageId: i, endTime: new Date(date.getTime() + 3600000), durationMinutes: 60, closedReason: "USER_PHOTO", violations: { create: { type: "NOT_CLOSED_IN_TIME" } } } });
  }
  const range = resolveReportPeriodRange({ key: "previous_month", timezone: "Asia/Bishkek", now: new Date("2026-02-01T00:00:00Z") });
  const all = await d.reportService.getAllEmployeesReport(range);
  expect(all.totalShifts).toBe(2); expect(all.totalViolations).toBe(2); expect(all.employees[0].lastShiftStart).toEqual(new Date("2026-01-31T17:59:59.999Z"));
  const report = (await d.reportService.getEmployeeReport(e.id, range))!;
  expect(report.totalShifts).toBe(2); expect(buildEmployeeReportMessage(report, "Asia/Bishkek")).toContain("01.02.2026 00:59");
});

test("a closing photo first received after a newer shift binds to the historical shift", async () => {
  const d = buildDeps();
  const a = await d.pendingActionService.createFromPhoto(photo(1, new Date("2026-01-01T00:00:00Z"))); if (a.type !== "pending") throw Error();
  await d.pendingActionService.confirmAction(a.pendingAction.id, "811", new Date("2026-01-01T00:01:00Z"));
  await d.shiftService.autoCloseOverdueShifts(new Date("2026-01-01T12:01:00Z"));
  const b = await d.pendingActionService.createFromPhoto(photo(2, new Date("2026-01-01T12:02:00Z"))); if (b.type !== "pending") throw Error();
  await d.pendingActionService.confirmAction(b.pendingAction.id, "811", new Date("2026-01-01T12:03:00Z"));
  const oldEnd = await d.pendingActionService.createFromPhoto(photo(3, new Date("2026-01-01T11:59:00Z"), new Date("2026-01-01T12:04:00Z"))); if (oldEnd.type !== "pending") throw Error();
  expect(oldEnd.actionType).toBe("END");
  await d.pendingActionService.confirmAction(oldEnd.pendingAction.id, "811", new Date("2026-01-01T12:05:00Z"));
  const rows = await prisma.shift.findMany({ orderBy: { id: "asc" } }); expect(rows[0].endTime).toEqual(new Date("2026-01-01T11:59:00Z")); expect(rows[1].endTime).toBeNull();
});

test("exports read all database rows while Telegram pagination remains bounded", async () => {
  const d = buildDeps(); const e = await d.employeeRepo.upsertFromTelegram(user);
  const time = new Date("2026-01-01T02:57:43Z");
  for (let offset = 0; offset < 10005; offset += 1000) await prisma.shift.createMany({ data: Array.from({ length: Math.min(1000, 10005 - offset) }, (_, i) => ({ employeeId: e.id, startTime: time, startChatId: "811", startMessageId: offset + i })) });
  const range = { from: new Date("2025-12-31T18:00:00Z"), to: new Date("2026-01-01T17:59:59.999Z") };
  expect((await d.reportService.getEmployeeReport(e.id, range))!.shifts).toHaveLength(10);
  expect(await d.reportService.getEmployeeShiftsForExport(e.id, range)).toHaveLength(10005);
  expect((await d.reportService.getRawShiftsForExport(range)).shifts).toHaveLength(10005);
});

test("an interrupted confirmation prompt is retried without replacing the photo timestamp", async () => {
  const d = buildDeps(); const source = new Date("2026-01-01T02:57:43Z");
  const a = await d.pendingActionService.createFromPhoto(photo(1, source)); if (a.type !== "pending") throw Error();
  const b = await d.pendingActionService.createFromPhoto(photo(1, source)); if (b.type !== "pending") throw Error();
  expect(b.pendingAction.id).toBe(a.pendingAction.id); expect(b.pendingAction.createdAt).toEqual(source);
  await d.pendingActionService.markPromptDelivered(b.pendingAction.id, 999);
  expect((await d.pendingActionService.createFromPhoto(photo(1, source))).type).toBe("duplicate");
});
