import { Telegraf } from "telegraf";
import { prisma } from "../../src/db/prisma";
import { logEvent } from "../../src/server/logging/eventLog";
import { runProcessUpdateQueueOnce } from "../../src/jobs/tasks/processUpdateQueueTask";
import { resetDb, disconnectDb } from "../helpers/createTestDb";
import { makeTextUpdate } from "../helpers/makeUpdate";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnectDb();
});

test("logEvent persists error row", async () => {
  await logEvent(prisma, {
    level: "error",
    kind: "test_error",
    updateId: 123,
    meta: { foo: "bar" },
    err: new Error("boom")
  });

  const row = await prisma.eventLog.findFirst({ where: { kind: "test_error" } });
  expect(row).not.toBeNull();
  expect(row?.errorMsg).toContain("boom");
});

test("queue processor logs error and retries", async () => {
  const bot = new Telegraf("test-token");
  (bot as any).handleUpdate = async () => {
    throw new Error("handler failed");
  };

  const update = makeTextUpdate({ updateId: 9000, chatId: 9000, fromId: 9000, text: "/start" });
  await prisma.telegramUpdateQueue.create({
    data: {
      updateId: update.update_id,
      payload: update,
      status: "pending",
      nextRunAt: new Date("2024-05-01T09:00:00Z")
    }
  });

  await runProcessUpdateQueueOnce({ bot, prisma, limit: 1, now: new Date("2024-05-01T10:00:00Z") });

  const queue = await prisma.telegramUpdateQueue.findUnique({ where: { updateId: update.update_id } });
  expect(queue?.attempts).toBe(1);
  expect(queue?.status).toBe("pending");

  const log = await prisma.eventLog.findFirst({ where: { kind: "queue_update_error" } });
  expect(log).not.toBeNull();
});
