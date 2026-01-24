import { createBot } from "../../src/bot/bot";
import { buildDeps } from "../helpers/buildDeps";
import { attachFakeTelegram } from "../helpers/fakeTelegram";
import { makePhotoUpdate, makeCallbackUpdate } from "../helpers/makeUpdate";
import { resetDb, disconnectDb } from "../helpers/createTestDb";
import { prisma } from "../../src/db/prisma";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnectDb();
});

test("photo start -> confirm start -> shift started", async () => {
  const deps = buildDeps();
  const bot = createBot(deps);
  const { getMessages } = attachFakeTelegram(bot);
  const baseSec = Math.floor(Date.now() / 1000);

  const photoUpdate = makePhotoUpdate({
    updateId: 10,
    chatId: 1000,
    fromId: 1000,
    messageId: 5001,
    date: baseSec
  });

  await bot.handleUpdate(photoUpdate as any);

  const messages = getMessages().map((call) => call.payload?.text ?? "");
  expect(messages).toEqual(expect.arrayContaining([expect.stringContaining("Подтвердите начало смены")]));

  const pending = await prisma.pendingAction.findFirst({ where: { chatId: "1000" } });
  expect(pending).not.toBeNull();

  const confirmUpdate = makeCallbackUpdate({
    updateId: 11,
    chatId: 1000,
    fromId: 1000,
    data: `pending_confirm:${pending?.id}`,
    messageId: 5001,
    date: baseSec + 5
  });

  await bot.handleUpdate(confirmUpdate as any);

  const afterMessages = getMessages().map((call) => call.payload?.text ?? "");
  expect(afterMessages).toEqual(expect.arrayContaining([expect.stringContaining("Смена началась")]));
});

test("photo end flow closes shift", async () => {
  const deps = buildDeps();
  const bot = createBot(deps);
  const { getMessages } = attachFakeTelegram(bot);
  const baseSec = Math.floor(Date.now() / 1000);

  const firstPhoto = makePhotoUpdate({
    updateId: 20,
    chatId: 2000,
    fromId: 2000,
    messageId: 6001,
    date: baseSec
  });
  await bot.handleUpdate(firstPhoto as any);

  const pendingStart = await prisma.pendingAction.findFirst({ where: { chatId: "2000" } });
  const confirmStart = makeCallbackUpdate({
    updateId: 21,
    chatId: 2000,
    fromId: 2000,
    data: `pending_confirm:${pendingStart?.id}`,
    messageId: 6001,
    date: baseSec + 5
  });
  await bot.handleUpdate(confirmStart as any);

  const secondPhoto = makePhotoUpdate({
    updateId: 22,
    chatId: 2000,
    fromId: 2000,
    messageId: 6002,
    date: baseSec + 10
  });
  await bot.handleUpdate(secondPhoto as any);

  const pendingEnd = await prisma.pendingAction.findFirst({
    where: { chatId: "2000", status: "PENDING" }
  });

  const confirmEnd = makeCallbackUpdate({
    updateId: 23,
    chatId: 2000,
    fromId: 2000,
    data: `pending_confirm:${pendingEnd?.id}`,
    messageId: 6002,
    date: baseSec + 15
  });
  await bot.handleUpdate(confirmEnd as any);

  const messages = getMessages().map((call) => call.payload?.text ?? "");
  expect(messages).toEqual(expect.arrayContaining([expect.stringContaining("Смена закрыта")]));
});

test("admin photo ignored", async () => {
  const deps = buildDeps();
  await deps.adminService.addAdmin("3000");
  const bot = createBot(deps);
  const { getMessages } = attachFakeTelegram(bot);
  const baseSec = Math.floor(Date.now() / 1000);

  const photoUpdate = makePhotoUpdate({
    updateId: 30,
    chatId: 3000,
    fromId: 3000,
    messageId: 7001,
    date: baseSec
  });

  await bot.handleUpdate(photoUpdate as any);

  const messages = getMessages().map((call) => call.payload?.text ?? "");
  expect(messages).toEqual(expect.arrayContaining([expect.stringContaining("Вы администратор")]));
});
