import { createBot } from "../../src/bot/bot";
import { buildDeps } from "../helpers/buildDeps";
import { attachFakeTelegram } from "../helpers/fakeTelegram";
import { makeTextUpdate } from "../helpers/makeUpdate";
import { resetDb, disconnectDb } from "../helpers/createTestDb";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnectDb();
});

test("/start replies with debug and employee message", async () => {
  const deps = buildDeps();
  const bot = createBot(deps);
  const { getMessages } = attachFakeTelegram(bot);

  const update = makeTextUpdate({
    updateId: 1,
    chatId: 10,
    fromId: 10,
    text: "/start",
    messageId: 111
  });

  await bot.handleUpdate(update as any);

  const messages = getMessages().map((call) => call.payload?.text ?? "");
  expect(messages).toEqual(expect.arrayContaining([
    expect.stringContaining("✅ DEBUG: /start reached"),
    expect.stringContaining("Отправьте фото")
  ]));
});

test("/start for admin replies with admin message and does not create employee", async () => {
  const deps = buildDeps();
  await deps.adminService.addAdmin("77");

  const bot = createBot(deps);
  const { getMessages } = attachFakeTelegram(bot);

  const update = makeTextUpdate({
    updateId: 2,
    chatId: 77,
    fromId: 77,
    text: "/start",
    messageId: 222
  });

  await bot.handleUpdate(update as any);

  const messages = getMessages().map((call) => call.payload?.text ?? "");
  expect(messages).toEqual(expect.arrayContaining([
    expect.stringContaining("✅ DEBUG: /start reached"),
    expect.stringContaining("Вы вошли как администратор")
  ]));

  const employee = await deps.employeeRepo.findByTelegramUserId("77");
  expect(employee).toBeNull();
});
