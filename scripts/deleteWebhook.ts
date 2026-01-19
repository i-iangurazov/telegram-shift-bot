import { env } from "../src/config/env";

const run = async (): Promise<void> => {
  const url = `https://api.telegram.org/bot${env.telegramBotToken}/deleteWebhook`;
  const response = await fetch(url, { method: "POST" });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Failed to delete webhook: ${JSON.stringify(data)}`);
  }

  // eslint-disable-next-line no-console
  console.log("Webhook deleted:", data);
};

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
