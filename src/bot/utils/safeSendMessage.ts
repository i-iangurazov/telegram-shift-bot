import { Telegram } from "telegraf";
import { logger } from "../../config/logger";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const getRetryAfterSeconds = (error: unknown): number | null => {
  const response = (error as any)?.response;
  if (!response || response.error_code !== 429) {
    return null;
  }
  const retryAfter = response.parameters?.retry_after;
  if (typeof retryAfter === "number" && Number.isFinite(retryAfter)) {
    return retryAfter;
  }
  return null;
};

export const safeSendMessage = async (
  telegram: Telegram,
  chatId: string | number,
  text: string,
  extra?: Parameters<Telegram["sendMessage"]>[2]
): Promise<Awaited<ReturnType<Telegram["sendMessage"]>> | null> => {
  try {
    return await telegram.sendMessage(chatId, text, extra);
  } catch (error) {
    const retryAfter = getRetryAfterSeconds(error);
    if (retryAfter != null) {
      const jitter = Math.floor(Math.random() * 500);
      await sleep(retryAfter * 1000 + jitter);
      try {
        return await telegram.sendMessage(chatId, text, extra);
      } catch (retryError) {
        logger.error({ err: retryError, chatId }, "Failed to send Telegram message after retry");
        return null;
      }
    }

    logger.error({ err: error, chatId }, "Failed to send Telegram message");
    return null;
  }
};
