import pino from "pino";
import { env } from "./env";

export const logger = pino({
  level: env.logLevel,
  base: {
    service: "telegram-shift-bot"
  }
});
