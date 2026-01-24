import { Prisma, PrismaClient } from "@prisma/client";
import { createHash } from "crypto";
import { env } from "../../config/env";

export type LogLevel = "error" | "warn" | "info";

export interface LogEventInput {
  level: LogLevel;
  kind: string;
  updateId?: number;
  chatId?: string | number | bigint | null;
  fromId?: string | number | bigint | null;
  messageId?: number | null;
  updateType?: string | null;
  meta?: Record<string, unknown> | null;
  err?: unknown;
}

type PrismaLike = PrismaClient | Prisma.TransactionClient;

type ErrorDetails = {
  name?: string;
  message?: string;
  stack?: string;
};

const MAX_ERROR_MSG = 1000;
const MAX_ERROR_STACK = 12000;
const MAX_META_JSON = 4000;
const MAX_META_STRING = 200;
const DEDUPE_WINDOW_MS = 10 * 60 * 1000;

const globalForEventLog = globalThis as unknown as {
  __eventLogNotifyState?: Record<string, number>;
};

const notifyState = globalForEventLog.__eventLogNotifyState ?? (globalForEventLog.__eventLogNotifyState = {});

const truncate = (value: string | undefined, max: number): string | undefined => {
  if (!value) {
    return undefined;
  }
  if (value.length <= max) {
    return value;
  }
  return value.slice(0, max);
};

const firstLine = (value?: string): string => {
  if (!value) {
    return "";
  }
  const line = value.split("\n")[0] ?? "";
  return line.trim();
};

const toIdString = (value: unknown): string | undefined => {
  if (value == null) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  return undefined;
};

const normalizeError = (err?: unknown): ErrorDetails => {
  if (!err) {
    return {};
  }
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack
    };
  }
  if (typeof err === "string") {
    return {
      name: "Error",
      message: err
    };
  }
  try {
    return {
      name: "Error",
      message: JSON.stringify(err)
    };
  } catch {
    return {
      name: typeof err,
      message: String(err)
    };
  }
};

const sanitizeShallowValue = (value: unknown): Prisma.InputJsonValue | undefined => {
  if (value == null) {
    return undefined;
  }
  if (typeof value === "string") {
    return truncate(value, MAX_META_STRING) ?? "";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    const sample = value.slice(0, 10).map((item) => {
      if (typeof item === "string") {
        return truncate(item, MAX_META_STRING) ?? "";
      }
      if (typeof item === "number" || typeof item === "boolean") {
        return item;
      }
      if (item == null) {
        return "[null]";
      }
      return "[complex]";
    });
    if (value.length > 10) {
      return { length: value.length, sample };
    }
    return sample;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > 10) {
      return { keys: entries.slice(0, 10).map(([key]) => key) };
    }
    const nested: Record<string, Prisma.InputJsonValue> = {};
    for (const [key, nestedValue] of entries) {
      if (typeof nestedValue === "string") {
        nested[key] = truncate(nestedValue, 120) ?? "";
        continue;
      }
      if (typeof nestedValue === "number" || typeof nestedValue === "boolean") {
        nested[key] = nestedValue;
        continue;
      }
      if (nestedValue == null) {
        continue;
      }
      nested[key] = "[complex]";
    }
    return nested;
  }

  return String(value).slice(0, MAX_META_STRING);
};

const sanitizeMeta = (meta: LogEventInput["meta"]): Prisma.InputJsonValue | undefined => {
  if (!meta || typeof meta !== "object") {
    return undefined;
  }
  const output: Record<string, Prisma.InputJsonValue> = {};
  for (const [key, value] of Object.entries(meta)) {
    const sanitized = sanitizeShallowValue(value);
    if (sanitized !== undefined) {
      output[key] = sanitized;
    }
  }

  try {
    const size = JSON.stringify(output).length;
    if (size <= MAX_META_JSON) {
      return output;
    }
  } catch {
    return undefined;
  }

  return {
    note: "meta_truncated",
    keys: Object.keys(output).slice(0, 12)
  };
};

const buildFingerprint = (params: {
  kind: string;
  updateType?: string | null;
  errorName?: string;
  errorMsg?: string;
  meta?: Prisma.InputJsonValue;
}): string => {
  const callbackPrefix =
    params.meta && typeof params.meta === "object" && !Array.isArray(params.meta)
      ? String((params.meta as Record<string, unknown>).callbackDataPrefix ?? "")
      : "";
  const payload = [
    params.kind,
    params.updateType ?? "",
    params.errorName ?? "",
    firstLine(params.errorMsg ?? ""),
    callbackPrefix
  ].join("|");

  return createHash("sha1").update(payload).digest("hex");
};

const buildBossMessage = (input: LogEventInput, error: ErrorDetails): string => {
  const summary = firstLine(error.message ?? "") || "—";
  const parts = [
    "Ошибка",
    `Тип: ${input.kind}`,
    `Update: ${input.updateType ?? "—"}`,
    `fromId: ${input.fromId ?? "—"}`,
    `chatId: ${input.chatId ?? "—"}`,
    `${error.name ?? "Ошибка"}: ${summary}`
  ];
  const message = parts.join("\n");
  return truncate(message, 1000) ?? message;
};

const sendBossNotification = async (text: string): Promise<void> => {
  if (!env.errorNotifyBoss) {
    return;
  }
  const chatId = env.telegramBossChatId;
  if (!chatId) {
    return;
  }

  const response = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Telegram notify failed: ${response.status} ${body}`);
  }
};

export const logEvent = async (prisma: PrismaLike, input: LogEventInput): Promise<void> => {
  try {
    const errorDetails = normalizeError(input.err);
    const errorMsg = truncate(errorDetails.message, MAX_ERROR_MSG);
    const errorStack = truncate(errorDetails.stack, MAX_ERROR_STACK);
    const meta = sanitizeMeta(input.meta);
    const updateType = input.updateType ?? undefined;

    const fingerprint =
      input.level === "error"
        ? buildFingerprint({
            kind: input.kind,
            updateType,
            errorName: errorDetails.name,
            errorMsg,
            meta
          })
        : undefined;

    if (fingerprint) {
      const dedupeCutoff = new Date(Date.now() - DEDUPE_WINDOW_MS);
      const existing = await prisma.eventLog.findFirst({
        where: {
          fingerprint,
          createdAt: { gte: dedupeCutoff }
        },
        select: { id: true }
      });

      if (existing) {
        return;
      }

      await prisma.eventLog.updateMany({
        where: {
          fingerprint,
          createdAt: { lt: dedupeCutoff }
        },
        data: { fingerprint: null }
      });
    }

    await prisma.eventLog.create({
      data: {
        level: input.level,
        kind: input.kind,
        updateId: input.updateId ?? undefined,
        chatId: toIdString(input.chatId),
        fromId: toIdString(input.fromId),
        messageId: input.messageId ?? undefined,
        updateType: updateType ?? undefined,
        meta: meta ?? undefined,
        errorName: errorDetails.name,
        errorMsg,
        errorStack,
        fingerprint
      }
    });

    if (input.level === "error" && env.errorNotifyBoss) {
      const now = Date.now();
      const lastSent = notifyState[input.kind] ?? 0;
      const cooldownMs = env.errorNotifyCooldownSec * 1000;
      if (now - lastSent >= cooldownMs) {
        notifyState[input.kind] = now;
        const message = buildBossMessage(input, errorDetails);
        void sendBossNotification(message).catch((error) => {
          console.error("Failed to notify boss", error);
        });
      }
    }
  } catch (error) {
    console.error("Failed to persist event log", error);
  }
};
