import { createBot } from "../../src/bot/bot";
import { buildDeps } from "../helpers/buildDeps";
import { attachFakeTelegram } from "../helpers/fakeTelegram";
import { resetDb, disconnectDb } from "../helpers/createTestDb";
import { makeCallbackUpdate } from "../helpers/makeUpdate";
import { prisma } from "../../src/db/prisma";
import { formatDate } from "../../src/utils/time";
import { env } from "../../src/config/env";

const DAY_MS = 24 * 60 * 60 * 1000;

const seedEmployeeWithShifts = async (params: { employeeId: string; count: number; base: Date }) => {
  const employee = await prisma.employee.create({
    data: {
      telegramUserId: params.employeeId,
      displayName: `User ${params.employeeId}`,
      firstName: "Test"
    }
  });

  for (let index = 0; index < params.count; index += 1) {
    const startTime = new Date(params.base.getTime() - index * DAY_MS);
    const endTime = new Date(startTime.getTime() + 8 * 60 * 60 * 1000);
    await prisma.shift.create({
      data: {
        employeeId: employee.id,
        startTime,
        endTime,
        startPhotoFileId: `start-${index}`,
        endPhotoFileId: `end-${index}`,
        startMessageId: 1000 + index,
        startChatId: params.employeeId,
        employeeChatId: params.employeeId,
        endMessageId: 2000 + index,
        endChatId: params.employeeId,
        closedReason: "USER_PHOTO",
        durationMinutes: 480
      }
    });
  }

  return employee;
};

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnectDb();
});

test("pagination next edits report message and updates list", async () => {
  const deps = buildDeps();
  await deps.adminService.addAdmin("900");
  const bot = createBot(deps);
  const { calls, getMessages } = attachFakeTelegram(bot);

  const base = new Date();
  const employee = await seedEmployeeWithShifts({ employeeId: "500", count: 12, base });

  const periodUpdate = makeCallbackUpdate({
    updateId: 100,
    chatId: 900,
    fromId: 900,
    data: `period_emp:30d:${employee.id}`,
    messageId: 1
  });

  await bot.handleUpdate(periodUpdate as any);

  const initialText = getMessages()[0]?.payload?.text ?? "";
  expect(initialText).toContain("Смены (показаны 1-10 из 12):");

  const expectedDate = formatDate(new Date(base.getTime() - 10 * DAY_MS), env.timezone);

  const nextUpdate = makeCallbackUpdate({
    updateId: 101,
    chatId: 900,
    fromId: 900,
    data: `emp_rep:${employee.id}:30d:1`,
    messageId: 1
  });

  await bot.handleUpdate(nextUpdate as any);

  const editCalls = calls.filter((call) => call.method === "editMessageText");
  const lastEdit = editCalls[editCalls.length - 1];
  expect(lastEdit?.payload?.text).toContain("Смены (показаны 11-12 из 12):");
  expect(lastEdit?.payload?.text).toContain(expectedDate);
});

test("export callback sends document for full range", async () => {
  const deps = buildDeps();
  await deps.adminService.addAdmin("901");
  const bot = createBot(deps);
  const { calls } = attachFakeTelegram(bot);

  const base = new Date();
  const employee = await seedEmployeeWithShifts({ employeeId: "501", count: 3, base });

  const exportUpdate = makeCallbackUpdate({
    updateId: 200,
    chatId: 901,
    fromId: 901,
    data: `emp_rep_export:${employee.id}:30d`,
    messageId: 2
  });

  await bot.handleUpdate(exportUpdate as any);

  const documentCall = calls.find((call) => call.method === "sendDocument");
  expect(documentCall).toBeTruthy();
});

test("legacy day-based callbacks are still supported", async () => {
  const deps = buildDeps();
  await deps.adminService.addAdmin("902");
  const bot = createBot(deps);
  const { calls, getMessages } = attachFakeTelegram(bot);

  const base = new Date();
  const employee = await seedEmployeeWithShifts({ employeeId: "502", count: 12, base });

  const legacyPeriodUpdate = makeCallbackUpdate({
    updateId: 300,
    chatId: 902,
    fromId: 902,
    data: `period_emp:30:${employee.id}`,
    messageId: 3
  });
  await bot.handleUpdate(legacyPeriodUpdate as any);

  const initialText = getMessages()[0]?.payload?.text ?? "";
  expect(initialText).toContain("Смены (показаны 1-10 из 12):");

  const legacyNextUpdate = makeCallbackUpdate({
    updateId: 301,
    chatId: 902,
    fromId: 902,
    data: `emp_rep:${employee.id}:30:1`,
    messageId: 3
  });
  await bot.handleUpdate(legacyNextUpdate as any);

  const editCalls = calls.filter((call) => call.method === "editMessageText");
  const lastEdit = editCalls[editCalls.length - 1];
  expect(lastEdit?.payload?.text).toContain("Смены (показаны 11-12 из 12):");

  const legacyExportUpdate = makeCallbackUpdate({
    updateId: 302,
    chatId: 902,
    fromId: 902,
    data: `emp_rep_export:${employee.id}:30`,
    messageId: 3
  });
  await bot.handleUpdate(legacyExportUpdate as any);

  const documentCalls = calls.filter((call) => call.method === "sendDocument");
  expect(documentCalls.length).toBeGreaterThan(0);
});
