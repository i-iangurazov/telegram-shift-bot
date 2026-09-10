import { redactSecrets } from "../utils/redact";
import pino from "pino";
import { env } from "./env";

export const logger = pino({
  level: env.logLevel,
  serializers: { err: (error: unknown) => error instanceof Error
    ? { type: error.name, message: redactSecrets(error.message), stack: redactSecrets(error.stack ?? "") }
    : { message: redactSecrets(String(error)) } },
  base: {
    service: "telegram-shift-bot"
  }
});
