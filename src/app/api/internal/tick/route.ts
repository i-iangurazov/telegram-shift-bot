import { NextRequest, NextResponse } from "next/server";
import { env } from "../../../../config/env";
import { getApp } from "../../../../server/appContainer";
import { runAutoCloseOnce } from "../../../../jobs/tasks/autoCloseTask";
import { runPendingActionCleanupOnce } from "../../../../jobs/tasks/pendingActionCleanupTask";
import { runPhotoRetentionCleanupOnce } from "../../../../jobs/tasks/photoRetentionTask";
import { runProcessUpdateQueueOnce } from "../../../../jobs/tasks/processUpdateQueueTask";
import { logger } from "../../../../config/logger";
import { logEvent } from "../../../../server/logging/eventLog";

export const runtime = "nodejs";

const isAuthorized = (req: NextRequest): boolean => {
  const authHeader = req.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const headerSecret = req.headers.get("x-internal-secret");
  return bearer === env.internalSecret || headerSecret === env.internalSecret;
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
