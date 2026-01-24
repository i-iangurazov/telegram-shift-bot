import { Telegraf } from "telegraf";
import { Prisma, PrismaClient } from "@prisma/client";
import { logEvent } from "../../server/logging/eventLog";

export interface ProcessQueueSummary {
  picked: number;
  processed: number;
  done: number;
  failed: number;
  skipped: number;
}

const MAX_ATTEMPTS = 10;
const BASE_BACKOFF_SECONDS = 10;
const MAX_BACKOFF_SECONDS = 10 * 60;

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

const extractQueueMeta = (payload: Record<string, any>) => {
  const updateType = detectUpdateType(payload);
  const message =
    payload.message ??
    payload.edited_message ??
    payload.channel_post ??
    payload.edited_channel_post ??
    payload.callback_query?.message ??
    payload.chat_join_request ??
    payload.chat_member ??
    payload.my_chat_member;
  const callbackData = payload.callback_query?.data;

  return {
    updateType,
    meta: {
      topKeys: Object.keys(payload),
      messageKeys: message ? Object.keys(message) : null,
      hasPhoto: Boolean(message?.photo?.length),
      hasText: Boolean(message?.text),
      hasCaption: Boolean(message?.caption),
      mediaGroupId: message?.media_group_id ? String(message.media_group_id) : undefined,
      callbackDataPrefix: typeof callbackData === "string" ? callbackData.slice(0, 20) : undefined
    }
  };
};

const getErrorMessage = (error: unknown): string => {
  if (!error) {
    return "Unknown error";
  }
  if (error instanceof Error) {
    return error.message || error.name;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const truncate = (value: string, max: number): string => {
  if (value.length <= max) {
    return value;
  }
  return value.slice(0, max);
};

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export const runProcessUpdateQueueOnce = async (params: {
  bot: Telegraf;
  prisma: PrismaLike;
  limit: number;
  now?: Date;
}): Promise<ProcessQueueSummary> => {
  const now = params.now ?? new Date();
  const rows = await params.prisma.telegramUpdateQueue.findMany({
    where: {
      status: "pending",
      nextRunAt: { lte: now }
    },
    orderBy: { createdAt: "asc" },
    take: params.limit
  });

  const summary: ProcessQueueSummary = {
    picked: rows.length,
    processed: 0,
    done: 0,
    failed: 0,
    skipped: 0
  };

  for (const row of rows) {
    const claimed = await params.prisma.telegramUpdateQueue.updateMany({
      where: {
        id: row.id,
        status: "pending",
        nextRunAt: { lte: now }
      },
      data: {
        status: "processing"
      }
    });

    if (claimed.count === 0) {
      summary.skipped += 1;
      continue;
    }

    summary.processed += 1;

    const payload = row.payload && typeof row.payload === "object" ? (row.payload as Record<string, any>) : {};
    const { updateType, meta } = extractQueueMeta(payload);

    try {
      await params.bot.handleUpdate(payload as any);
      await params.prisma.telegramUpdateQueue.update({
        where: { id: row.id },
        data: {
          status: "done"
        }
      });
      summary.done += 1;
    } catch (error) {
      const nextAttempts = row.attempts + 1;
      const backoffSeconds = Math.min(Math.pow(2, nextAttempts) * BASE_BACKOFF_SECONDS, MAX_BACKOFF_SECONDS);
      const jitter = Math.floor(Math.random() * 1000);
      const nextRunAt = new Date(Date.now() + backoffSeconds * 1000 + jitter);
      const status = nextAttempts >= MAX_ATTEMPTS ? "failed" : "pending";
      const lastError = truncate(getErrorMessage(error), 500);

      await params.prisma.telegramUpdateQueue.update({
        where: { id: row.id },
        data: {
          status,
          attempts: nextAttempts,
          lastError,
          nextRunAt
        }
      });

      if (status === "failed") {
        summary.failed += 1;
      }

      await logEvent(params.prisma, {
        level: "error",
        kind: "queue_update_error",
        updateId: row.updateId,
        updateType,
        meta: {
          ...meta,
          attempts: nextAttempts
        },
        err: error
      });

    }
  }

  return summary;
};
