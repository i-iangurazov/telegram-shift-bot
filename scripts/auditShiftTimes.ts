/** Read-only evidence audit. Output contains IDs and timestamps, never tokens or names. */
import { mkdirSync, writeFileSync } from "node:fs";
import { env } from "../src/config/env";
import { prisma } from "../src/db/prisma";
async function main() {
  const [shifts, pending, queue] = await Promise.all([
    prisma.shift.findMany(), prisma.pendingAction.findMany(),
    prisma.telegramUpdateQueue.findMany({ select: { payload: true } })
  ]);
  const source = new Map<string, Date>();
  for (const a of pending) source.set(`${a.chatId}:${a.photoMessageId}`, a.createdAt);
  for (const q of queue) {
    const m = (q.payload as any)?.message;
    if (m?.photo && Number.isInteger(m.date)) source.set(`${m.chat.id}:${m.message_id}`, new Date(m.date * 1000));
  }
  const mismatches: unknown[] = [], unverified: unknown[] = [];
  let verified = 0;
  for (const s of shifts) for (const edge of ["start", "end"] as const) {
    if (edge === "end" && s.closedReason !== "USER_PHOTO") continue;
    const evidence = source.get(`${s[`${edge}ChatId`]}:${s[`${edge}MessageId`]}`);
    if (!evidence) unverified.push({ shiftId: s.id, edge });
    else if (s[`${edge}Time`]?.getTime() !== evidence.getTime()) mismatches.push({ shiftId: s.id, edge, stored: s[`${edge}Time`], evidence });
    else verified++;
  }
  const result = { botId: env.telegramBotToken.split(":")[0], verified, mismatches, unverified };
  mkdirSync(".local", { recursive: true, mode: 0o700 });
  writeFileSync(`.local/audit-${result.botId}.json`, JSON.stringify(result, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ botId: result.botId, verified, mismatches: mismatches.length, unverified: unverified.length }));
}
main().catch(() => { console.error("Аудит не завершён"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
