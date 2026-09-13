import ExcelJS from "exceljs";
import { createBot } from "../../src/bot/bot";
import { buildDeps } from "../helpers/buildDeps";
import { attachFakeTelegram } from "../helpers/fakeTelegram";
import { makeCallbackUpdate, makeTextUpdate } from "../helpers/makeUpdate";
import { resetDb, disconnectDb } from "../helpers/createTestDb";
import { XLSX_MIME } from "../../src/services/exportService";

const DAY_MS = 86400000;
beforeEach(resetDb);
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
afterAll(disconnectDb);

test("50-day menus, report pages and XLSX keep the same inclusive range", async () => {
  jest.useFakeTimers({
    now: new Date("2026-01-01T18:01:23.456Z"),
    doNotFake: ["hrtime", "nextTick", "performance", "queueMicrotask", "setImmediate", "clearImmediate", "setInterval", "clearInterval", "setTimeout", "clearTimeout"]
  });
  const d = buildDeps();
  await d.adminService.addAdmin("777");
  const employee = await d.employeeRepo.upsertFromTelegram({ id: 811, chatId: 811, firstName: "Иван" });
  const base = Date.now();
  const included = [];
  for (const age of [1, 2, 3, 4, 5, 6, 31, 35, 40, 45, 49, 50]) {
    included.push(await d.prisma.shift.create({ data: {
      employeeId: employee.id, startTime: new Date(base - age * DAY_MS),
      endTime: new Date(base - age * DAY_MS + 8 * 3600000),
      durationMinutes: 480, closedReason: "USER_PHOTO", startMessageId: age, startChatId: "811"
    } }));
  }
  await d.prisma.shift.create({ data: {
    employeeId: employee.id, startTime: new Date(base - 50 * DAY_MS - 1), startMessageId: 99, startChatId: "811"
  } });
  const bot = createBot(d);
  const fake = attachFakeTelegram(bot);
  let updateId = 1;
  const cb = async (data: string) => bot.handleUpdate(makeCallbackUpdate({ updateId: updateId++, chatId: 777, fromId: 777, data }) as any);
  const buttons = (payload: any) => payload.reply_markup.inline_keyboard.flat();

  await bot.handleUpdate(makeTextUpdate({ updateId: updateId++, chatId: 777, fromId: 777, text: "/report" }) as any);
  expect(buttons(fake.getMessages().at(-1)!.payload)).toEqual(expect.arrayContaining([
    expect.objectContaining({ text: "За 50 дней", callback_data: "period_all:50d" })
  ]));
  await cb(`emp_action:report:${employee.id}:1:`);
  expect(buttons(fake.getMessages().at(-1)!.payload)).toEqual(expect.arrayContaining([
    expect.objectContaining({ text: "За 50 дней", callback_data: `period_emp:50d:${employee.id}` })
  ]));

  await cb(`period_emp:50d:${employee.id}`);
  const report = fake.getMessages().at(-1)!.payload;
  expect(report.text).toContain("Период: 13.11.2025 – 02.01.2026");
  expect(report.text).toContain("Смены (показаны 1-10 из 12):");
  expect(buttons(report)).toEqual(expect.arrayContaining([
    expect.objectContaining({ callback_data: `emp_rep:${employee.id}:50d:1` }),
    expect.objectContaining({ callback_data: `emp_rep_export:${employee.id}:50d` })
  ]));
  await cb(`emp_rep:${employee.id}:50d:1`);
  expect(fake.calls.filter(c => c.method === "editMessageText").at(-1)!.payload.text).toContain("Смены (показаны 11-12 из 12):");
  await cb("period_all:50d");
  expect(buttons(fake.getMessages().at(-1)!.payload)).toEqual(expect.arrayContaining([
    expect.objectContaining({ callback_data: "export_all:xlsx:50d" })
  ]));
  for (const data of [`emp_rep_export:${employee.id}:50d`, "export_all:xlsx:50d", "export_all:csv:50d"]) await cb(data);
  const documents = fake.calls.filter(c => c.method === "sendDocument");
  expect(documents).toHaveLength(3);
  for (const document of documents) {
    expect(document.payload.document.mimeType).toBe(XLSX_MIME);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(document.payload.document.source);
    const detail = book.getWorksheet("Смены")!;
    expect(detail.rowCount).toBe(19);
    expect(detail.getCell("A2").value).toBe("Период: 13.11.2025 00:01 — 02.01.2026 00:01");
    const ids = Array.from({ length: 12 }, (_, i) => Number(detail.getCell(i + 7, 13).value));
    expect(ids.sort((a, b) => a - b)).toEqual(included.map(s => s.id).sort((a, b) => a - b));
    expect(detail.getCell("J19").value).toBe(5760);
    // ExcelJS reads cells formatted as durations as dates; convert to Excel days.
    const duration = detail.getCell("F19").value;
    const durationDays = duration instanceof Date ? duration.getTime() / DAY_MS + 25569 : duration;
    expect(durationDays).toBe(4);
    expect(detail.getCell("F19").numFmt).toBe("[h]:mm");
    expect(book.getWorksheet("Сводка")!.getCell("B8").value).toBe(12);
  }
});
