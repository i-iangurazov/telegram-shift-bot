import type { Logger as PinoLogger } from "pino";

export type Logger = Pick<PinoLogger, "info" | "warn" | "error">;
