import type { ReactNode } from "react";

export const metadata = {
  title: "Telegram Shift Bot",
  description: "Webhook endpoints for Telegram bot"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
