import { NextRequest, NextResponse } from "next/server";
import { env } from "../../../../../config/env";
import { logger } from "../../../../../config/logger";
import { prisma } from "../../../../../db/prisma";
import { getApp } from "../../../../../server/appContainer";
import { logEvent } from "../../../../../server/logging/eventLog";

export const runtime = "nodejs";

const detectUpdateType = (update: Record<string, unknown>): string | undefined => {
  const knownTypes = [
    "message",
    "edited_message",
    "callback_query",
    "inline_query",
    "chosen_inline_result",
    "channel_post",
    "edited_channel_post",
    "chat_member",
    "my_chat_member",
    "chat_join_request",
    "shipping_query",
    "pre_checkout_query",
    "poll",
    "poll_answer"
  ];

  for (const key of knownTypes) {
    if (key in update) {
      return key;
    }
  }
  return undefined;
};

const extractUpdateMeta = (update: Record<string, any>) => {
  const updateType = detectUpdateType(update);
  const message =
    update.message ??
    update.edited_message ??
    update.channel_post ??
    update.edited_channel_post ??
    update.callback_query?.message ??
    update.chat_join_request ??
    update.chat_member ??
    update.my_chat_member;
  const from =
    update.message?.from ??
    update.edited_message?.from ??
    update.callback_query?.from ??
    update.inline_query?.from ??
    update.chosen_inline_result?.from ??
    update.chat_join_request?.from ??
    update.chat_member?.from ??
    update.my_chat_member?.from ??
    update.shipping_query?.from ??
    update.pre_checkout_query?.from ??
    update.poll_answer?.user;

  const chatId = message?.chat?.id ?? update.callback_query?.message?.chat?.id ?? update.chat_join_request?.chat?.id;
  const fromId = from?.id;
  const messageId = message?.message_id ?? update.callback_query?.message?.message_id;
  const callbackData = update.callback_query?.data;

  return {
    updateType,
    updateId: typeof update.update_id === "number" ? update.update_id : undefined,
    chatId,
    fromId,
    messageId,
    meta: {
      topKeys: Object.keys(update),
      messageKeys: message ? Object.keys(message) : null,
      hasPhoto: Boolean(message?.photo?.length),
      hasText: Boolean(message?.text),
      hasCaption: Boolean(message?.caption),
      mediaGroupId: message?.media_group_id ? String(message.media_group_id) : undefined,
      callbackDataPrefix: typeof callbackData === "string" ? callbackData.slice(0, 20) : undefined
    }
  };
};

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

  const contentType = req.headers.get("content-type");
  let rawBody = "";
  let update: Record<string, any>;

  try {
    rawBody = await req.text();
    update = JSON.parse(rawBody);
  } catch (error) {
    try {
      await logEvent(prisma, {
        level: "error",
        kind: "webhook_parse_error",
        meta: {
          rawLen: rawBody.length,
          contentType
        },
        err: error
      });
    } catch (logError) {
      logger.error({ err: logError }, "Failed to log webhook parse error");
    }
    return NextResponse.json({ ok: true });
  }

  const updateId = typeof update.update_id === "number" ? update.update_id : null;
  if (!updateId) {
    await logEvent(prisma, {
      level: "error",
      kind: "webhook_missing_update_id",
      meta: { topKeys: Object.keys(update) },
      err: new Error("Missing update_id")
    });
    return NextResponse.json({ ok: true });
  }

  try {
    await prisma.telegramUpdateQueue.upsert({
      where: { updateId },
      update: {},
      create: {
        updateId,
        payload: update
      }
    });
  } catch (error) {
    try {
      const meta = extractUpdateMeta(update);
      await logEvent(prisma, {
        level: "error",
        kind: "webhook_queue_error",
        ...meta,
        err: error
      });
    } catch (logError) {
      logger.error({ err: logError }, "Failed to log webhook queue error");
    }
  }

  try {
    const app = await getApp();
    await app.bot.handleUpdate(update);
  } catch (error) {
    try {
      const meta = extractUpdateMeta(update);
      await logEvent(prisma, {
        level: "error",
        kind: "webhook_handle_error",
        ...meta,
        err: error
      });
    } catch (logError) {
      logger.error({ err: logError }, "Failed to log webhook handle error");
    }
  }

  return NextResponse.json({ ok: true });
}
