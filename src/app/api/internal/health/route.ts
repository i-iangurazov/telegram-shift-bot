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

  const ts = new Date().toISOString();
  const region = detectRegion(req);

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, ts, region, db: "ok" });
  } catch (error) {
    return NextResponse.json({ ok: false, ts, region, db: "error" }, { status: 500 });
  }
}
