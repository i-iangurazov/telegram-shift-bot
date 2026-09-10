import ExcelJS from "exceljs";
import { createBot } from "../../src/bot/bot";
import { buildDeps } from "../helpers/buildDeps";
import { attachFakeTelegram } from "../helpers/fakeTelegram";
import { makeCallbackUpdate } from "../helpers/makeUpdate";
import { resetDb, disconnectDb } from "../helpers/createTestDb";
import { XLSX_MIME } from "../../src/services/exportService";
import { sendXlsxDocument } from "../../src/bot/xlsxTransport";
beforeEach(resetDb); afterAll(disconnectDb);

test("all current and legacy export callbacks deliver real XLSX", async () => {
  const d = buildDeps(); await d.prisma.admin.create({ data: { telegramUserId: "777" } });
  const e = await d.employeeRepo.upsertFromTelegram({ id: 811, chatId: 811, firstName: "Иван" });
  await d.prisma.shift.create({ data: { employeeId: e.id, startTime: new Date(), startChatId: "811", startMessageId: 1 } });
  const bot = createBot(d); const fake = attachFakeTelegram(bot);
  let id = 1;
  for (const data of [`export_emp:csv:7:${e.id}`, `export_emp:xlsx:7:${e.id}`, `emp_rep_export:${e.id}:7d`, "export_all:csv:7d", "export_all:xlsx:7d"]) {
    await bot.handleUpdate(makeCallbackUpdate({ updateId: id++, chatId: 777, fromId: 777, data }) as any);
  }
  const files = fake.calls.filter(c => c.method === "sendDocument"); expect(files).toHaveLength(5);
  for (const f of files) { expect(f.payload.document.filename).toMatch(/\.xlsx$/); expect(f.payload.document.mimeType).toBe(XLSX_MIME); const b = new ExcelJS.Workbook(); await b.xlsx.load(f.payload.document.source); expect(b.getWorksheet("Смены")!.rowCount).toBe(8); }
});

test("multipart upload carries XLSX content type and Cyrillic filename", async () => {
  const fetchMock = jest.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    const file = (init?.body as FormData).get("document") as File;
    expect(file.type).toBe(XLSX_MIME); expect(file.name).toBe("Отчёт.xlsx");
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
  });
  try { await sendXlsxDocument("test-token", { chat_id: 1, document: { source: Buffer.from("test"), filename: "Отчёт.xlsx" } }); } finally { fetchMock.mockRestore(); }
});
