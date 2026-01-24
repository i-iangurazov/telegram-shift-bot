import { NextRequest } from "next/server";
import { prisma } from "../../src/db/prisma";
import { resetDb, disconnectDb } from "../helpers/createTestDb";
import { makeTextUpdate } from "../helpers/makeUpdate";
import { attachFakeTelegram } from "../helpers/fakeTelegram";
import { buildDeps } from "../helpers/buildDeps";

const buildRequest = (url: string, headers?: Record<string, string>) => {
  return new NextRequest(url, {
    method: "POST",
    headers: {
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

test("rejects missing internal secret", async () => {
  const { POST } = await import("../../src/app/api/internal/tick/route");
  const req = buildRequest("http://localhost/api/internal/tick");
  const res = await POST(req);
  expect(res.status).toBe(401);
});

test("queue mode processes pending updates", async () => {
  const { POST } = await import("../../src/app/api/internal/tick/route");
  const { getApp } = await import("../../src/server/appContainer");

  const app = await getApp();
  attachFakeTelegram(app.bot);
  (app.bot as any).handleUpdate = async () => {};

  const update = makeTextUpdate({ updateId: 500, chatId: 500, fromId: 500, text: "/start" });
  await prisma.telegramUpdateQueue.create({
    data: {
      updateId: update.update_id,
      payload: update,
      status: "pending",
      nextRunAt: new Date(Date.now() - 1000)
    }
  });

  const req = buildRequest("http://localhost/api/internal/tick?mode=queue", {
    Authorization: "Bearer test-internal"
  });

  const res = await POST(req);
  expect(res.status).toBe(200);

  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.queue?.processed).toBe(1);

  const stored = await prisma.telegramUpdateQueue.findUnique({ where: { updateId: update.update_id } });
  expect(stored?.status).toBe("done");
});

test("regular mode runs pending cleanup and auto-close", async () => {
  const { POST } = await import("../../src/app/api/internal/tick/route");
  const { getApp } = await import("../../src/server/appContainer");
  const app = await getApp();
  attachFakeTelegram(app.bot);

  const deps = buildDeps();
  const employee = await deps.employeeRepo.upsertFromTelegram({
    id: 700,
    firstName: "Reg",
    lastName: "Test",
    chatId: 700
  });

  const now = new Date();
  await prisma.pendingAction.create({
    data: {
      employeeId: employee.id,
      telegramUserId: employee.telegramUserId,
      chatId: "700",
      actionType: "START",
      photoFileId: "photo",
      photoMessageId: 999,
      createdAt: new Date(now.getTime() - 20 * 60 * 1000),
      expiresAt: new Date(now.getTime() - 5 * 60 * 1000),
      status: "PENDING"
    }
  });

  await prisma.shift.create({
    data: {
      employeeId: employee.id,
      startTime: new Date(now.getTime() - 13 * 60 * 60 * 1000),
      startPhotoFileId: "old",
      startMessageId: 1001,
      startChatId: "700",
      employeeChatId: "700"
    }
  });

  const req = buildRequest("http://localhost/api/internal/tick", {
    Authorization: "Bearer test-internal"
  });

  const res = await POST(req);
  expect(res.status).toBe(200);

  const pending = await prisma.pendingAction.findMany({ where: { telegramUserId: employee.telegramUserId } });
  expect(pending[0]?.status).toBe("EXPIRED");

  const closed = await prisma.shift.findFirst({ where: { employeeId: employee.id } });
  expect(closed?.closedReason).toBe("AUTO_TIMEOUT");
});

test("daily mode purges old event logs", async () => {
  const { POST } = await import("../../src/app/api/internal/tick/route");

  await prisma.eventLog.create({
    data: {
      level: "error",
      kind: "test",
      createdAt: new Date("2000-01-01T00:00:00Z")
    }
  });

  const req = buildRequest("http://localhost/api/internal/tick?mode=daily", {
    Authorization: "Bearer test-internal"
  });

  const res = await POST(req);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.logsPurged).toBeGreaterThanOrEqual(1);
});
