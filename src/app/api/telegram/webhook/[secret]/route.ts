import { NextRequest, NextResponse } from "next/server";
import { env } from "../../../../../config/env";
import { getApp } from "../../../../../server/appContainer";
import { logger } from "../../../../../config/logger";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: { secret: string } }
): Promise<NextResponse> {
  if (params.secret !== env.webhookSecret) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  if (env.telegramWebhookSecretToken) {
    const headerToken = req.headers.get("x-telegram-bot-api-secret-token");
    if (headerToken !== env.telegramWebhookSecretToken) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }

  try {
    const update = await req.json();
    const { bot } = await getApp();
    await bot.handleUpdate(update);
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error({ err: error }, "Webhook handler failed");
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
