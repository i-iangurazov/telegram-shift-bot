import { Markup } from "telegraf";

export const buildErrorsPeriodKeyboard = (): ReturnType<typeof Markup.inlineKeyboard> => {
  return Markup.inlineKeyboard([
    [Markup.button.callback("1 час", "errors:period:1h"), Markup.button.callback("6 часов", "errors:period:6h")],
    [Markup.button.callback("24 часа", "errors:period:24h"), Markup.button.callback("7 дней", "errors:period:7d")]
  ]);
};
