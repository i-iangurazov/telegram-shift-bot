import { NextRequest, NextResponse } from "next/server";
import { env } from "../../../../config/env";
import { getApp } from "../../../../server/appContainer";
import { runAutoCloseOnce } from "../../../../jobs/tasks/autoCloseTask";
import { runPendingActionCleanupOnce } from "../../../../jobs/tasks/pendingActionCleanupTask";
import { runPhotoRetentionCleanupOnce } from "../../../../jobs/tasks/photoRetentionTask";
import { logger } from "../../../../config/logger";

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
  const mode = modeParam === "daily" ? "daily" : "regular";
  const ranAt = new Date();

  try {
    const app = await getApp();
    const expiredPending = await runPendingActionCleanupOnce(app.pendingActionService, {
      now: ranAt,
      limit: env.tickMaxExpirePending
    });
    const autoCloseSummary = await runAutoCloseOnce(app.bot, app.shiftService, app.adminService, {
      now: ranAt,
      limit: env.tickMaxAutoclose
    });

    let photosPurged = 0;
    if (mode === "daily") {
      photosPurged = await runPhotoRetentionCleanupOnce(app.shiftRepo, {
        now: ranAt,
        limit: env.tickMaxExpirePending
      });
    }

    return NextResponse.json({
      ok: true,
      mode,
      expiredPending,
      autoClosed: autoCloseSummary.autoClosed,
      photosPurged,
      ranAt: ranAt.toISOString()
    });
  } catch (error) {
    logger.error({ err: error }, "Internal tick failed");
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
