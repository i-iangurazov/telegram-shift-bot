import { NextRequest } from "next/server";
import { prisma } from "../../src/db/prisma";
import { resetDb, disconnectDb } from "../helpers/createTestDb";
import { makeTextUpdate } from "../helpers/makeUpdate";
import { attachFakeTelegram } from "../helpers/fakeTelegram";

const buildRequest = (url: string, body: unknown) =>
  new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": "testhdr"
    }
  });

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnectDb();
});

test("webhook burst enqueues all updates", async () => {
  const { POST } = await import("../../src/app/api/telegram/webhook/[secret]/route");
  const { getApp } = await import("../../src/server/appContainer");
  const app = await getApp();
  attachFakeTelegram(app.bot);
  (app.bot as any).handleUpdate = async () => {};

  const updates = Array.from({ length: 40 }).map((_, idx) =>
    makeTextUpdate({
      updateId: 1000 + idx,
      chatId: 1000 + idx,
      fromId: 1000 + idx,
      text: "/start"
    })
  );

  const responses = await Promise.all(
    updates.map((update) =>
      POST(buildRequest("http://localhost/api/telegram/webhook/test-secret", update), {
        params: { secret: "test-secret" }
      })
    )
  );

  expect(responses.every((res) => res.status === 200)).toBe(true);

  const count = await prisma.telegramUpdateQueue.count();
  expect(count).toBe(40);
});


test("duplicate update_id enqueues only once", async () => {
  const { POST } = await import("../../src/app/api/telegram/webhook/[secret]/route");
  const { getApp } = await import("../../src/server/appContainer");
  const app = await getApp();
  attachFakeTelegram(app.bot);
  (app.bot as any).handleUpdate = async () => {};

  const update = makeTextUpdate({
    updateId: 2000,
    chatId: 2000,
    fromId: 2000,
    text: "/start"
  });

  await Promise.all(
    Array.from({ length: 10 }).map(() =>
      POST(buildRequest("http://localhost/api/telegram/webhook/test-secret", update), {
        params: { secret: "test-secret" }
      })
    )
  );

  const count = await prisma.telegramUpdateQueue.count({ where: { updateId: 2000 } });
  expect(count).toBe(1);
});
