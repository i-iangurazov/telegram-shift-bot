import { NextRequest, NextResponse } from "next/server";
import { env } from "../../../../config/env";
import { getApp } from "../../../../server/appContainer";
import { runAutoCloseOnce } from "../../../../jobs/tasks/autoCloseTask";
import { runPendingActionCleanupOnce } from "../../../../jobs/tasks/pendingActionCleanupTask";
import { runPhotoRetentionCleanupOnce } from "../../../../jobs/tasks/photoRetentionTask";
import { runProcessUpdateQueueOnce } from "../../../../jobs/tasks/processUpdateQueueTask";
import { logger } from "../../../../config/logger";
import { logEvent } from "../../../../server/logging/eventLog";
import { safeSendMessage } from "../../../../bot/utils/safeSendMessage";

export const runtime = "nodejs";

const isAuthorized = (req: NextRequest): boolean => {
  const authHeader = req.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const headerSecret = req.headers.get("x-internal-secret");
  return bearer === env.internalSecret || headerSecret === env.internalSecret;
};

const monitorQueueBacklog = async (params: {
  prisma: Awaited<ReturnType<typeof getApp>>["prisma"];
  bot: Awaited<ReturnType<typeof getApp>>["bot"];
  now: Date;
}): Promise<void> => {
  const oldestPending = await params.prisma.telegramUpdateQueue.findFirst({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true }
  });

  if (!oldestPending) {
    return;
  }

  const ageSeconds = Math.floor((params.now.getTime() - oldestPending.createdAt.getTime()) / 1000);
  if (ageSeconds <= 180) {
    return;
  }

  await logEvent(params.prisma, {
    level: "warn",
    kind: "queue_backlog_detected",
    meta: {
      ageSeconds,
      oldestCreatedAt: oldestPending.createdAt.toISOString()
    }
  });

  const alertCutoff = new Date(params.now.getTime() - 60 * 60 * 1000);
  const recentAlert = await params.prisma.eventLog.findFirst({
    where: {
      kind: "queue_backlog_alert_sent",
      createdAt: { gte: alertCutoff }
    },
    select: { id: true }
  });

  if (recentAlert || !env.telegramBossChatId) {
    return;
  }

  const message = `⚠️ Очередь Telegram отстаёт: старейшая запись ${ageSeconds} сек.`;
  const sendResult = await safeSendMessage(params.bot.telegram, env.telegramBossChatId, message);

  if (sendResult.ok) {
    await logEvent(params.prisma, {
      level: "warn",
      kind: "queue_backlog_alert_sent",
      meta: {
        ageSeconds,
        oldestCreatedAt: oldestPending.createdAt.toISOString()
      }
    });
  } else {
    await logEvent(params.prisma, {
      level: "warn",
      kind: "queue_backlog_alert_failed",
      meta: {
        ageSeconds,
        oldestCreatedAt: oldestPending.createdAt.toISOString(),
        reason: sendResult.reason
      }
    });
  }
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const modeParam = req.nextUrl.searchParams.get("mode");
  const mode = modeParam === "daily" ? "daily" : modeParam === "queue" ? "queue" : "regular";
  const ranAt = new Date();

  let app: Awaited<ReturnType<typeof getApp>> | null = null;

  try {
    app = await getApp();
    let queueSummary = null;
    if (mode !== "daily") {
      queueSummary = await runProcessUpdateQueueOnce({
        bot: app.bot,
        prisma: app.prisma,
        limit: 25,
        now: ranAt
      });
    }

    let expiredPending = 0;
    let autoCloseSummary = { autoClosed: 0, notifiedAdmins: 0, notifiedEmployees: 0 };

    if (mode !== "queue") {
      expiredPending = await runPendingActionCleanupOnce(app.pendingActionService, {
        now: ranAt,
        limit: env.tickMaxExpirePending
      });
      autoCloseSummary = await runAutoCloseOnce(app.bot, app.shiftService, app.adminService, {
        now: ranAt,
        limit: env.tickMaxAutoclose
      });
    }

    if (mode === "regular") {
      await monitorQueueBacklog({ prisma: app.prisma, bot: app.bot, now: ranAt });
    }

    let photosPurged = 0;
    let logsPurged = 0;
    if (mode === "daily") {
      photosPurged = await runPhotoRetentionCleanupOnce(app.shiftRepo, {
        now: ranAt,
        limit: env.tickMaxExpirePending
      });

      const retentionDays = env.eventLogRetentionDays;
      const cutoff = new Date(ranAt.getTime() - retentionDays * 24 * 60 * 60 * 1000);
      const deleted = await app.prisma.eventLog.deleteMany({
        where: { createdAt: { lt: cutoff } }
      });
      logsPurged = deleted.count;
    }

    return NextResponse.json({
      ok: true,
      mode,
      queue: queueSummary,
      expiredPending,
      autoClosed: autoCloseSummary.autoClosed,
      photosPurged,
      logsPurged,
      ranAt: ranAt.toISOString()
    });
  } catch (error) {
    try {
      const logApp = app ?? (await getApp());
      await logEvent(logApp.prisma, {
        level: "error",
        kind: "tick_error",
        meta: { mode },
        err: error
      });
    } catch (logError) {
      logger.error({ err: logError }, "Failed to log tick error");
    }
    logger.error({ err: error }, "Internal tick failed");
    return NextResponse.json({
      ok: true,
      mode,
      error: true,
      ranAt: ranAt.toISOString()
    });
  }
}
