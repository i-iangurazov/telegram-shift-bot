import { table } from "../../db/table";
import { Telegraf } from "telegraf";
import { Prisma, PrismaClient } from "@prisma/client";
import { logEvent } from "../../server/logging/eventLog";
import { updateContext } from "../../server/updateContext";

export interface ProcessQueueSummary { picked: number; processed: number; done: number; failed: number; skipped: number; retried: number; recovered: number }
const LEASE_MS = 120_000;
export const updateActorKey = (u: any): string => String(u.message?.from?.id ?? u.callback_query?.from?.id ?? u.edited_message?.from?.id ?? `update:${u.update_id}`);

type PrismaLike = PrismaClient | Prisma.TransactionClient;
export const runProcessUpdateQueueOnce = async (params: { bot: Telegraf; prisma: PrismaLike; limit: number; now?: Date; actorKey?: string }): Promise<ProcessQueueSummary> => {
  const now = params.now ?? new Date();
  const recovered = await params.prisma.telegramUpdateQueue.updateMany({
    where: { status: "processing", nextRunAt: { lte: now } }, data: { status: "pending" }
  });
  const rows = await params.prisma.telegramUpdateQueue.findMany({
    where: { status: "pending", nextRunAt: { lte: now }, ...(params.actorKey ? { actorKey: params.actorKey } : {}) },
    orderBy: [{ createdAt: "asc" }, { updateId: "asc" }], take: params.limit
  });
  const summary: ProcessQueueSummary = { picked: rows.length, processed: 0, done: 0, failed: 0, skipped: 0, retried: 0, recovered: recovered.count };
  for (const row of rows) {
    const lease = new Date(Date.now() + LEASE_MS);
    // One atomic claim. An older pending/processing event blocks later events of
    // the same employee, including while it is waiting for a retry.
    const claimed = await params.prisma.$executeRaw`
      UPDATE ${table("TelegramUpdateQueue")} q SET status = 'processing', "nextRunAt" = (${lease}::timestamptz AT TIME ZONE 'UTC')
      WHERE q.id = ${row.id} AND q.status = 'pending' AND q."nextRunAt" <= (${now}::timestamptz AT TIME ZONE 'UTC')
        AND NOT EXISTS (
          SELECT 1 FROM ${table("TelegramUpdateQueue")} older
          WHERE older."actorKey" = q."actorKey" AND older.status IN ('pending', 'processing', 'failed')
          AND (older."createdAt", older."updateId") < (q."createdAt", q."updateId")
        )`;
    if (!claimed) { summary.skipped++; continue; }
    summary.processed++;
    try {
      await updateContext.run({ receivedAt: row.createdAt, updateId: row.updateId }, () => params.bot.handleUpdate(row.payload as any));
      await params.prisma.telegramUpdateQueue.updateMany({ where: { id: row.id, status: "processing", nextRunAt: lease }, data: { status: "done", lastError: null } });
      summary.done++;
    } catch (error) {
      const attempts = row.attempts + 1;
      const status = attempts >= 10 ? "failed" : "pending";
      const nextRunAt = new Date(Date.now() + Math.min(2 ** attempts * 10000, 600000));
      // Do not persist arbitrary HTTP error text: it can contain token-bearing URLs.
      await params.prisma.telegramUpdateQueue.updateMany({ where: { id: row.id, status: "processing", nextRunAt: lease },
        data: { status, attempts, nextRunAt, lastError: error instanceof Error ? error.name : "Error" } });
      if (status === "failed") summary.failed++; else summary.retried++;
      await logEvent(params.prisma, { level: "error", kind: "queue_update_error", updateId: row.updateId, meta: { attempts, status } });
    }
  }
  return summary;
};
