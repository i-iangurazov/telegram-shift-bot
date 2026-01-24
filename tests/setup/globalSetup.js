const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const { execSync } = require("child_process");

const envPath = path.join(process.cwd(), ".env.test");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

process.env.NODE_ENV = "test";
process.env.TELEGRAM_BOT_TOKEN ||= "test-token";
process.env.TELEGRAM_BOSS_CHAT_ID ||= "999999";
process.env.ADMIN_USER_IDS ||= "";
process.env.WEBHOOK_SECRET ||= "test-secret";
process.env.INTERNAL_SECRET ||= "test-internal";
process.env.PUBLIC_BASE_URL ||= "http://localhost:3000";
process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN ||= "testhdr";
process.env.TIMEZONE ||= "Asia/Bishkek";
process.env.NOTIFY_EMPLOYEE_ON_AUTOCLOSE ||= "false";
process.env.ERROR_NOTIFY_BOSS ||= "false";
process.env.ERROR_NOTIFY_COOLDOWN_SEC ||= "60";
process.env.EVENT_LOG_RETENTION_DAYS ||= "14";
process.env.LOG_LEVEL ||= "error";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/shift_bot_test?schema=public";
}
if (!process.env.DIRECT_URL) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}

module.exports = async () => {
  execSync("pnpm prisma migrate deploy", {
    stdio: "inherit",
    env: process.env
  });
};
