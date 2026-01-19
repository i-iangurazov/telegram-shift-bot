import { env } from "../src/config/env";

const run = async (): Promise<void> => {
  const url = `https://api.telegram.org/bot${env.telegramBotToken}/setWebhook`;
  const webhookUrl = `${env.publicBaseUrl}/api/telegram/webhook/${env.webhookSecret}`;

  const payload: Record<string, string> = {
    url: webhookUrl
  };

  if (env.telegramWebhookSecretToken) {
    payload.secret_token = env.telegramWebhookSecretToken;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Failed to set webhook: ${JSON.stringify(data)}`);
  }

  // eslint-disable-next-line no-console
  console.log("Webhook set:", data);
};

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
