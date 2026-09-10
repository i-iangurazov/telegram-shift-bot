import { prisma } from "../../src/db/prisma";
import { resetDb, disconnectDb } from "../helpers/createTestDb";
import { runProcessUpdateQueueOnce } from "../../src/jobs/tasks/processUpdateQueueTask";
import { updateReceivedAt } from "../../src/server/updateContext";
beforeEach(resetDb); afterAll(disconnectDb);

test("queue serializes an employee, retries failures, preserves arrival time, and recovers interrupted leases", async () => {
  const receivedAt = new Date("2026-01-01T00:00:00Z");
  for (const updateId of [1, 2]) await prisma.telegramUpdateQueue.create({ data: { updateId, actorKey: "1", payload: { update_id: updateId }, createdAt: new Date(receivedAt.getTime() + updateId), nextRunAt: receivedAt } });
  let fail = true; const seen: number[] = [];
  const bot = { handleUpdate: async (u: any) => { if (fail) throw new Error("temporary"); seen.push(u.update_id); expect(updateReceivedAt()).toEqual(new Date(receivedAt.getTime() + u.update_id)); } } as any;
  const first = await runProcessUpdateQueueOnce({ prisma, bot, limit: 25 }); expect(first.retried).toBe(1); expect(first.skipped).toBe(1); expect(seen).toEqual([]);
  fail = false;
  await prisma.telegramUpdateQueue.updateMany({ data: { nextRunAt: receivedAt } });
  await Promise.all([runProcessUpdateQueueOnce({ prisma, bot, limit: 25 }), runProcessUpdateQueueOnce({ prisma, bot, limit: 25 })]);
  await runProcessUpdateQueueOnce({ prisma, bot, limit: 25 }); expect(seen).toEqual([1, 2]); expect(await prisma.telegramUpdateQueue.count({ where: { status: "done" } })).toBe(2);
  await prisma.telegramUpdateQueue.create({ data: { updateId: 3, actorKey: "1", payload: { update_id: 3 }, createdAt: new Date(receivedAt.getTime() + 3), status: "processing", nextRunAt: receivedAt } });
  const recovered = await runProcessUpdateQueueOnce({ prisma, bot, limit: 25 }); expect(recovered.recovered).toBe(1); expect(seen).toEqual([1, 2, 3]);
});
