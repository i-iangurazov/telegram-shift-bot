import { NextRequest, NextResponse } from "next/server";
import { env } from "../../../../config/env";
import { logger } from "../../../../config/logger";
import { buildDailyDigestMessage, buildWeeklyDigestMessage } from "../../../../bot/formatters/digestFormatter";
import { splitMessage } from "../../../../bot/formatters/reportFormatter";
import { safeSendMessage } from "../../../../bot/utils/safeSendMessage";
import { parseDigestDateKey } from "../../../../services/digestService";
import { getApp } from "../../../../server/appContainer";

export const runtime = "nodejs";

const isAuthorized = (req: NextRequest): boolean => {
  const authHeader = req.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const headerSecret = req.headers.get("x-internal-secret");
  return bearer === env.internalSecret || headerSecret === env.internalSecret;
};

const parseType = (value: string | null): "daily" | "weekly" | null => {
  if (value === "daily" || value === "weekly") {
    return value;
  }
  return null;
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const type = parseType(req.nextUrl.searchParams.get("type"));
  if (!type) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid type. Use ?type=daily|weekly"
      },
      { status: 400 }
    );
  }

  try {
    const app = await getApp();
    let message = "";
    let from: Date;
    let to: Date;
    let dateKey: string | undefined;

    if (type === "daily") {
      const dateParam = req.nextUrl.searchParams.get("date");
      let selectedDate: Date | undefined;
      if (dateParam) {
        const parsed = parseDigestDateKey(dateParam, env.timezone);
        if (!parsed) {
          return NextResponse.json(
            {
              ok: false,
              error: "Invalid date. Use YYYY-MM-DD in configured timezone."
            },
            { status: 400 }
          );
        }
        selectedDate = parsed;
      }

      const report = await app.digestService.getDailyDigestReport({
        timezone: env.timezone,
        date: selectedDate
      });
      message = buildDailyDigestMessage(report);
      from = report.range.from;
      to = report.range.to;
      dateKey = report.dateKey;
    } else {
      const report = await app.digestService.getWeeklyDigestReport({
        timezone: env.timezone,
        days: 7
      });
      message = buildWeeklyDigestMessage(report);
      from = report.range.from;
      to = report.range.to;
    }

    const chatId = env.telegramBossChatId;
    if (!chatId) {
      return NextResponse.json(
        {
          ok: false,
          error: "TELEGRAM_BOSS_CHAT_ID is not configured."
        },
        { status: 500 }
      );
    }

    const chunks = splitMessage(message);
    let sentChunks = 0;

    for (const chunk of chunks) {
      const sent = await safeSendMessage(app.bot.telegram, chatId, chunk);
      if (!sent.ok) {
        logger.error({ reason: sent.reason, type }, "Digest send failed");
        return NextResponse.json(
          {
            ok: false,
            type,
            sentChunks,
            error: sent.reason
          },
          { status: 502 }
        );
      }
      sentChunks += 1;
    }

    return NextResponse.json({
      ok: true,
      type,
      dateKey,
      sentChunks,
      range: {
        from: from.toISOString(),
        to: to.toISOString()
      }
    });
  } catch (error) {
    logger.error({ err: error, type }, "Failed to build internal digest");
    return NextResponse.json(
      {
        ok: false,
        type,
        error: true
      },
      { status: 500 }
    );
  }
}
