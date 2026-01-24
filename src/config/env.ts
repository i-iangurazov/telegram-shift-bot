import dotenv from "dotenv";
import { z } from "zod";

if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_BOSS_CHAT_ID: z.string().min(1),
  ADMIN_USER_IDS: z.string().optional(),
  DATABASE_URL: z.string().min(1),
  WEBHOOK_SECRET: z.string().min(1),
  INTERNAL_SECRET: z.string().min(1),
  PUBLIC_BASE_URL: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET_TOKEN: z.string().optional(),
  TIMEZONE: z.string().default("Asia/Bishkek"),
  MAX_SHIFT_HOURS: z.coerce.number().int().positive().default(12),
  MIN_SHIFT_HOURS: z.coerce.number().int().positive().default(8),
  SHORT_SHIFT_GRACE_MINUTES: z.coerce.number().int().min(0).default(0),
  PENDING_ACTION_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  PENDING_ACTION_CLEANUP_CRON: z.string().default("*/2 * * * *"),
  PHOTO_RETENTION_DAYS: z.coerce.number().int().positive().default(3),
  PHOTO_RETENTION_CRON: z.string().default("0 * * * *"),
  OVERDUE_CHECK_CRON: z.string().default("*/5 * * * *"),
  TICK_MAX_AUTOCLOSE: z.coerce.number().int().positive().default(50),
  TICK_MAX_EXPIRE_PENDING: z.coerce.number().int().positive().default(200),
  NOTIFY_EMPLOYEE_ON_AUTOCLOSE: z.coerce.boolean().default(true),
  ERROR_NOTIFY_BOSS: z.coerce.boolean().default(false),
  ERROR_NOTIFY_COOLDOWN_SEC: z.coerce.number().int().positive().default(60),
  EVENT_LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(14),
  LOG_LEVEL: z.string().default("info"),
  NODE_ENV: z.string().optional()
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const formatted = parsed.error.format();
  throw new Error(`Invalid environment configuration: ${JSON.stringify(formatted)}`);
}

export const env = {
  telegramBotToken: parsed.data.TELEGRAM_BOT_TOKEN,
  telegramBossChatId: parsed.data.TELEGRAM_BOSS_CHAT_ID,
  adminUserIds: (parsed.data.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  databaseUrl: parsed.data.DATABASE_URL,
  webhookSecret: parsed.data.WEBHOOK_SECRET,
  internalSecret: parsed.data.INTERNAL_SECRET,
  publicBaseUrl: parsed.data.PUBLIC_BASE_URL,
  telegramWebhookSecretToken: parsed.data.TELEGRAM_WEBHOOK_SECRET_TOKEN ?? null,
  timezone: parsed.data.TIMEZONE,
  maxShiftHours: parsed.data.MAX_SHIFT_HOURS,
  minShiftHours: parsed.data.MIN_SHIFT_HOURS,
  shortShiftGraceMinutes: parsed.data.SHORT_SHIFT_GRACE_MINUTES,
  pendingActionTtlMinutes: parsed.data.PENDING_ACTION_TTL_MINUTES,
  pendingActionCleanupCron: parsed.data.PENDING_ACTION_CLEANUP_CRON,
  photoRetentionDays: parsed.data.PHOTO_RETENTION_DAYS,
  photoRetentionCron: parsed.data.PHOTO_RETENTION_CRON,
  overdueCheckCron: parsed.data.OVERDUE_CHECK_CRON,
  tickMaxAutoclose: parsed.data.TICK_MAX_AUTOCLOSE,
  tickMaxExpirePending: parsed.data.TICK_MAX_EXPIRE_PENDING,
  notifyEmployeeOnAutoClose: parsed.data.NOTIFY_EMPLOYEE_ON_AUTOCLOSE,
  errorNotifyBoss: parsed.data.ERROR_NOTIFY_BOSS,
  errorNotifyCooldownSec: parsed.data.ERROR_NOTIFY_COOLDOWN_SEC,
  eventLogRetentionDays: parsed.data.EVENT_LOG_RETENTION_DAYS,
  logLevel: parsed.data.LOG_LEVEL,
  nodeEnv: parsed.data.NODE_ENV
};
