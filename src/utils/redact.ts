export function redactSecrets(text: string): string {
  let result = text.replace(/(?:postgres(?:ql)?:\/\/)[^\s"']+/gi, "[DATABASE_URL]")
    .replace(/\b\d{6,12}:[A-Za-z0-9_-]{25,}\b/g, "[BOT_TOKEN]");
  for (const key of ["TELEGRAM_BOT_TOKEN", "WEBHOOK_SECRET", "INTERNAL_SECRET", "CRON_SECRET", "TELEGRAM_WEBHOOK_SECRET_TOKEN", "DATABASE_URL", "DIRECT_URL"]) {
    const value = process.env[key];
    if (value && value.length >= 6) result = result.split(value).join(`[${key}]`);
  }
  return result;
}
