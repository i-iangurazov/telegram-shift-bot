import { NextRequest } from "next/server";
import { prisma } from "../../src/db/prisma";
import { resetDb, disconnectDb } from "../helpers/createTestDb";
import { makeTextUpdate } from "../helpers/makeUpdate";
import { attachFakeTelegram } from "../helpers/fakeTelegram";

const buildRequest = (url: string, body: unknown, headers?: Record<string, string>) => {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...headers
    }
  });
};

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnectDb();
});

test("rejects wrong secret", async () => {
  const { POST } = await import("../../src/app/api/telegram/webhook/[secret]/route");

  const req = buildRequest("http://localhost/api/telegram/webhook/wrong", makeTextUpdate({
    updateId: 1,
    chatId: 1,
    fromId: 1,
    text: "/start"
  }));

  const res = await POST(req, { params: { secret: "wrong" } });
  expect(res.status).toBe(404);
});

test("rejects wrong telegram secret header", async () => {
  const { POST } = await import("../../src/app/api/telegram/webhook/[secret]/route");

  const req = buildRequest(
    "http://localhost/api/telegram/webhook/test-secret",
    makeTextUpdate({ updateId: 2, chatId: 2, fromId: 2, text: "/start" })
  );

  const res = await POST(req, { params: { secret: "test-secret" } });
  expect(res.status).toBe(401);
});

test("enqueues update idempotently and returns ok", async () => {
  const { POST } = await import("../../src/app/api/telegram/webhook/[secret]/route");

  const { getApp } = await import("../../src/server/appContainer");
  const app = await getApp();
  attachFakeTelegram(app.bot);
  const handleSpy = jest.fn(async () => {});
  (app.bot as any).handleUpdate = handleSpy;

  const update = makeTextUpdate({ updateId: 10, chatId: 10, fromId: 10, text: "/start" });

  const req1 = buildRequest(
    "http://localhost/api/telegram/webhook/test-secret",
    update,
    { "x-telegram-bot-api-secret-token": "testhdr" }
  );
  const req2 = buildRequest(
    "http://localhost/api/telegram/webhook/test-secret",
    update,
    { "x-telegram-bot-api-secret-token": "testhdr" }
  );

  const res1 = await POST(req1, { params: { secret: "test-secret" } });
  const res2 = await POST(req2, { params: { secret: "test-secret" } });
  expect(res1.status).toBe(200);
  expect(res2.status).toBe(200);

  const count = await prisma.telegramUpdateQueue.count({ where: { updateId: 10 } });
  expect(count).toBe(1);
  expect(handleSpy).toHaveBeenCalledTimes(2);
});

test("webhook returns ok even when handler throws", async () => {
  const { POST } = await import("../../src/app/api/telegram/webhook/[secret]/route");
  const { getApp } = await import("../../src/server/appContainer");
  const app = await getApp();
  attachFakeTelegram(app.bot);
  (app.bot as any).handleUpdate = jest.fn(async () => {
    throw new Error("boom");
  });

  const update = makeTextUpdate({ updateId: 30, chatId: 30, fromId: 30, text: "/start" });
  const req = buildRequest(
    "http://localhost/api/telegram/webhook/test-secret",
    update,
    { "x-telegram-bot-api-secret-token": "testhdr" }
  );

  const res = await POST(req, { params: { secret: "test-secret" } });
  expect(res.status).toBe(200);
});
