import { Telegraf, Telegram } from "telegraf";

type TelegramCall = { method: string; payload: any };

const globalStore = globalThis as unknown as {
  __telegramCalls?: TelegramCall[];
  __telegramPatched?: boolean;
};

const ensurePatched = () => {
  if (globalStore.__telegramPatched) {
    return;
  }

  globalStore.__telegramPatched = true;
  globalStore.__telegramCalls = globalStore.__telegramCalls ?? [];

  Telegram.prototype.callApi = async function callApi(method: string, payload: any) {
    globalStore.__telegramCalls?.push({ method, payload });
    if (method === "sendMessage") {
      return {
        message_id: payload?.message_id ?? 1,
        date: Math.floor(new Date("2024-01-01T00:00:00Z").getTime() / 1000),
        chat: { id: payload?.chat_id ?? 0 },
        text: payload?.text
      };
    }
    if (method === "answerCallbackQuery") {
      return true;
    }
    return { ok: true };
  };
};

const resetCalls = () => {
  if (globalStore.__telegramCalls) {
    globalStore.__telegramCalls.length = 0;
  } else {
    globalStore.__telegramCalls = [];
  }
};

export const attachFakeTelegram = (bot?: Telegraf) => {
  ensurePatched();
  resetCalls();

  if (bot?.telegram) {
    (bot.telegram as any).callApi = Telegram.prototype.callApi.bind(bot.telegram);
  }

  const calls = globalStore.__telegramCalls ?? [];
  return {
    calls,
    getMessages: () => calls.filter((call) => call.method === "sendMessage")
  };
};
