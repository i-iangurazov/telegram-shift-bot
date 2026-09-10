/** Apply a reviewed queue plan after a full backup. Never replays Telegram messages.
 * ENV_FILE=<instance.env> pnpm exec ts-node scripts/reconcileLegacyQueue.ts <plan.json> [--apply]
 */
import { readFileSync } from "node:fs";
import { env } from "../src/config/env";
import { prisma } from "../src/db/prisma";

type PlannedRow = { id: string; updateId: number; receivedAt: string; classification: string; proof: string | null };
async function main() {
  const plan = JSON.parse(readFileSync(process.argv[2], "utf8")) as { botId: string; backlog: PlannedRow[] };
  if (plan.botId !== env.telegramBotToken.split(":")[0]) throw new Error("План относится к другому боту");
  const rows = plan.backlog.filter(r => ["done_evidence", "quarantine_old"].includes(r.classification));
  console.log(JSON.stringify({ mode: process.argv.includes("--apply") ? "apply" : "preview", rows: rows.length }));
  if (!process.argv.includes("--apply")) return;
  const result = await prisma.$transaction(async tx => {
    let changed = 0;
    for (let offset = 0; offset < rows.length; offset += 200) {
      const batch = rows.slice(offset, offset + 200);
      const stored = await tx.telegramUpdateQueue.findMany({ where: { id: { in: batch.map(r => r.id) } } });
      for (const row of stored) {
        const expected = batch.find(r => r.id === row.id)!;
        if (row.updateId !== expected.updateId || row.createdAt.toISOString() !== expected.receivedAt) throw new Error("Запись изменилась после предварительного просмотра");
      }
      for (const classification of ["done_evidence", "quarantine_old"]) {
        const selected = batch.filter(r => r.classification === classification);
        const updated = await tx.telegramUpdateQueue.updateMany({ where: { id: { in: selected.map(r => r.id) }, status: "pending" }, data: {
          status: classification === "done_evidence" ? "done" : "quarantined",
          lastError: classification === "done_evidence" ? "Verified from linked pending action; maintenance 2026-09-10" : "Historical event retained for review; do not replay automatically"
        } });
        changed += updated.count;
      }
    }
    return changed;
  }, { timeout: 120000 });
  console.log(JSON.stringify({ changed: result }));
}
main().catch(() => { console.error("Обработка остановлена; подробности проверьте локально без вывода секретов"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
