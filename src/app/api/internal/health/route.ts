import { buildExampleReport } from "../../../../services/reportExample";
import { NextRequest, NextResponse } from "next/server";
import { env } from "../../../../config/env";
import { prisma } from "../../../../db/prisma";

export const runtime = "nodejs";

const isAuthorized = (req: NextRequest): boolean => {
  const authHeader = req.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const headerSecret = req.headers.get("x-internal-secret");
  return bearer === env.internalSecret || headerSecret === env.internalSecret;
};

const detectRegion = (req: NextRequest): string => {
  const vercelId = req.headers.get("x-vercel-id");
  if (!vercelId) {
    return "unknown";
  }
  const parts = vercelId.split("::");
  return parts[0] || "unknown";
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  if (req.nextUrl.searchParams.get("check") === "xlsx") {
    const file = await buildExampleReport(env.timezone);
    return new NextResponse(new Uint8Array(file.content), { headers: {
      "Content-Type": file.mimeType, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "Cache-Control": "no-store"
    } });
  }
  const ts = new Date().toISOString();
  const region = detectRegion(req);

  try {
    await prisma.$queryRaw`SELECT 1`;
    const [queue, latestTick] = await Promise.all([
      prisma.telegramUpdateQueue.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.eventLog.findFirst({ where: { kind: "tick_completed" }, orderBy: { createdAt: "desc" }, select: { createdAt: true, meta: true } })
    ]);
    return NextResponse.json({ ok: true, ts, region, db: "ok",
      version: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.APP_VERSION ?? "local",
      botId: env.telegramBotToken.split(":")[0], profile: env.botProfile, timezone: env.timezone,
      maxShiftHours: env.maxShiftHours, dailyAutoCloseTime: env.dailyAutoCloseTime,
      exports: "xlsx", queue, latestTick });
  } catch (error) {
    return NextResponse.json({ ok: false, ts, region, db: "error" }, { status: 500 });
  }
}
