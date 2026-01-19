import { Markup } from "telegraf";

export const buildPendingActionKeyboard = (pendingActionId: number): ReturnType<typeof Markup.inlineKeyboard> => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("✅ Подтвердить", `pending_confirm:${pendingActionId}`),
      Markup.button.callback("❌ Отменить", `pending_cancel:${pendingActionId}`)
    ]
  ]);
};
