import { Telegram } from "telegraf";
import { prisma } from "../db/prisma";
import { logEvent } from "../server/logging/eventLog";

export type SafeTelegramResult<T> = { ok: true; result: T } | { ok: false; reason: string; error?: unknown };

const DEFAULT_RETRY_DELAYS_MS = [300, 800, 1600];
const NETWORK_ERROR_CODES = new Set(["ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "ENOTFOUND", "ECONNREFUSED"]);
const RAW_CALL_API = Symbol.for("shiftbot.rawCallApi");
const SAFE_APPLIED = Symbol.for("shiftbot.safeTelegramApplied");
const SAFE_CALL_API = Symbol.for("shiftbot.safeTelegramCallApi");

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const getErrorDetails = (error: unknown): {
  errorCode?: number;
  description?: string;
  retryAfterSeconds?: number;
  networkCode?: string;
} => {
  const response = (error as any)?.response;
  const errorCode = typeof response?.error_code === "number" ? response.error_code : undefined;
  const description = typeof response?.description === "string" ? response.description : undefined;
  const retryAfterSeconds = typeof response?.parameters?.retry_after === "number"
    ? response.parameters.retry_after
    : undefined;
  const networkCode = (error as any)?.code ?? (error as any)?.cause?.code;
  return { errorCode, description, retryAfterSeconds, networkCode };
};

const isChatNotFound = (description?: string): boolean =>
  Boolean(description && description.toLowerCase().includes("chat not found"));

const isUserBlocked = (description?: string): boolean =>
  Boolean(description && description.toLowerCase().includes("bot was blocked by the user"));

const shouldRetry = (details: ReturnType<typeof getErrorDetails>): boolean => {
  if (details.retryAfterSeconds != null) {
    return true;
  }
  if (details.errorCode && details.errorCode >= 500) {
    return true;
  }
  if (details.errorCode && [400, 401, 403, 404].includes(details.errorCode)) {
    return false;
  }
  if (isChatNotFound(details.description) || isUserBlocked(details.description)) {
    return false;
  }
  if (details.networkCode && NETWORK_ERROR_CODES.has(details.networkCode)) {
    return true;
  }
  return false;
};

const buildReason = (details: ReturnType<typeof getErrorDetails>, fallback: string): string => {
  if (details.description) {
    return details.description;
  }
  if (details.errorCode) {
    return `Telegram error ${details.errorCode}`;
  }
  if (details.networkCode) {
    return `Network error ${details.networkCode}`;
  }
  return fallback;
};

const logTelegramSendError = async (params: {
  method: string;
  chatId?: string | number;
  attempt: number;
  error: unknown;
  willRetry: boolean;
}): Promise<void> => {
  const details = getErrorDetails(params.error);
  await logEvent(prisma, {
    level: "warn",
    kind: "telegram_send_error",
    chatId: params.chatId ?? undefined,
    meta: {
      method: params.method,
      attempt: params.attempt,
      willRetry: params.willRetry,
      errorCode: details.errorCode,
      description: details.description,
      networkCode: details.networkCode
    },
    err: params.error
  });
};

const safeTelegramCall = async <T>(params: {
  telegram: Telegram;
  method: string;
  payload: Record<string, unknown>;
  rawCall: (method: string, payload: any) => Promise<T>;
  maxRetries?: number;
}): Promise<SafeTelegramResult<T>> => {
  const maxRetries = params.maxRetries ?? DEFAULT_RETRY_DELAYS_MS.length;
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      const result = await params.rawCall(params.method, params.payload);
      return { ok: true, result };
    } catch (error) {
      const details = getErrorDetails(error);
      const willRetry = attempt < maxRetries && shouldRetry(details);
      try {
        await logTelegramSendError({
          method: params.method,
          chatId: params.payload?.chat_id as string | number | undefined,
          attempt,
          error,
          willRetry
        });
      } catch {
        // logging must not break send flow
      }

      if (!willRetry) {
        return { ok: false, reason: buildReason(details, "Telegram send failed"), error };
      }

      let delayMs: number;
      if (details.retryAfterSeconds != null) {
        const jitter = Math.floor(Math.random() * 250);
        delayMs = details.retryAfterSeconds * 1000 + jitter;
      } else {
        const base = DEFAULT_RETRY_DELAYS_MS[Math.min(attempt, DEFAULT_RETRY_DELAYS_MS.length - 1)];
        const jitter = Math.floor(Math.random() * 150);
        delayMs = base + jitter;
      }

      attempt += 1;
      await sleep(delayMs);
    }
  }

  return { ok: false, reason: "Telegram send failed" };
};

const getRawCall = (telegram: Telegram): ((method: string, payload: any) => Promise<any>) => {
  const anyTelegram = telegram as any;
  const raw = anyTelegram[RAW_CALL_API];
  const wrapped = anyTelegram[SAFE_CALL_API];
  if (typeof raw === "function" && telegram.callApi === wrapped) {
    return raw.bind(telegram) as (method: string, payload: any) => Promise<any>;
  }
  return (telegram.callApi as unknown as (method: string, payload: any) => Promise<any>).bind(telegram);
};

export const applySafeTelegram = (telegram: Telegram): void => {
  const anyTelegram = telegram as any;
  if (anyTelegram[SAFE_APPLIED]) {
    return;
  }
  anyTelegram[SAFE_APPLIED] = true;
  anyTelegram[RAW_CALL_API] = telegram.callApi.bind(telegram);

  const wrappedCall = async (method: string, payload: any) => {
    const result = await safeTelegramCall({
      telegram,
      method,
      payload: payload ?? {},
      rawCall: anyTelegram[RAW_CALL_API]
    });
    if (result.ok) {
      return result.result;
    }
    return { ok: false };
  };
  anyTelegram[SAFE_CALL_API] = wrappedCall;
  telegram.callApi = wrappedCall as unknown as Telegram["callApi"];
};

export const safeSendMessage = async (
  telegram: Telegram,
  chatId: string | number,
  text: string,
  extra?: Parameters<Telegram["sendMessage"]>[2]
): Promise<SafeTelegramResult<Awaited<ReturnType<Telegram["sendMessage"]>>>> => {
  const payload = { chat_id: chatId, text, ...(extra ?? {}) };
  return safeTelegramCall({
    telegram,
    method: "sendMessage",
    payload,
    rawCall: getRawCall(telegram)
  });
};

export const safeSendPhoto = async (
  telegram: Telegram,
  chatId: string | number,
  photo: Parameters<Telegram["sendPhoto"]>[1],
  extra?: Parameters<Telegram["sendPhoto"]>[2]
): Promise<SafeTelegramResult<Awaited<ReturnType<Telegram["sendPhoto"]>>>> => {
  const payload = { chat_id: chatId, photo, ...(extra ?? {}) };
  return safeTelegramCall({
    telegram,
    method: "sendPhoto",
    payload,
    rawCall: getRawCall(telegram)
  });
};

export const safeSendDocument = async (
  telegram: Telegram,
  chatId: string | number,
  document: Parameters<Telegram["sendDocument"]>[1],
  extra?: Parameters<Telegram["sendDocument"]>[2]
): Promise<SafeTelegramResult<Awaited<ReturnType<Telegram["sendDocument"]>>>> => {
  const payload = { chat_id: chatId, document, ...(extra ?? {}) };
  return safeTelegramCall({
    telegram,
    method: "sendDocument",
    payload,
    rawCall: getRawCall(telegram)
  });
};

export const safeAnswerCallbackQuery = async (
  telegram: Telegram,
  callbackQueryId: string,
  extra?: Parameters<Telegram["answerCbQuery"]>[1]
): Promise<SafeTelegramResult<Awaited<ReturnType<Telegram["answerCbQuery"]>>>> => {
  const payload = {
    callback_query_id: callbackQueryId,
    ...((extra ?? {}) as Record<string, unknown>)
  };
  return safeTelegramCall({
    telegram,
    method: "answerCallbackQuery",
    payload,
    rawCall: getRawCall(telegram)
  });
};
