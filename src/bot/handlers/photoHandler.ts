import { Telegraf } from "telegraf";
import { RoleService } from "../../services/roleService";
import { PendingActionService } from "../../services/pendingActionService";
import { messages } from "../messages";
import { logger } from "../../config/logger";
import { PendingActionType } from "@prisma/client";
import { buildPendingActionKeyboard } from "../keyboards/pendingActionKeyboards";

export const registerPhotoHandler = (
  bot: Telegraf,
  roleService: RoleService,
  pendingActionService: PendingActionService
): void => {
  bot.on("photo", async (ctx) => {
    const from = ctx.from;
    const chat = ctx.chat;
    const message = ctx.message;

    if (!from || !chat || !message || !("photo" in message)) {
      return;
    }

    const photos = message.photo;
    if (!photos || photos.length === 0) {
      return;
    }

    const largestPhoto = photos[photos.length - 1];
    const fileId = largestPhoto.file_id;
    const messageDate = new Date(message.date * 1000);

    const role = await roleService.resolveRole(String(from.id));
    if (!roleService.shouldProcessPhoto(role)) {
      if (role.mode === "ADMIN") {
        await ctx.reply(messages.adminPhotoIgnored);
      } else {
        await ctx.reply(messages.notEmployee);
      }
      return;
    }

    try {
      const result = await pendingActionService.createFromPhoto({
        user: {
          id: from.id,
          username: from.username,
          firstName: from.first_name,
          lastName: from.last_name,
          chatId: chat.id
        },
        messageId: message.message_id,
        chatId: chat.id,
        fileId,
        messageDate
      });

      if (result.type === "duplicate") {
        return;
      }

      const prompt = result.actionType === PendingActionType.START
        ? messages.confirmStartPrompt
        : messages.confirmEndPrompt;

      await ctx.reply(prompt, buildPendingActionKeyboard(result.pendingAction.id));
    } catch (error) {
      logger.error({ err: error }, "Failed to create pending action");
      await ctx.reply("Не удалось обработать фото. Попробуйте позже.");
    }
  });

  bot.catch((error, ctx) => {
    const update = ctx.update as {
      update_id?: number;
      message?: { message_id?: number };
      callback_query?: { data?: string };
    };
    logger.error(
      {
        err: error,
        updateId: update?.update_id,
        updateType: ctx.updateType,
        chatId: ctx.chat?.id,
        fromId: ctx.from?.id,
        messageId: update?.message?.message_id,
        callbackData: update?.callback_query?.data
      },
      "Bot error"
    );
  });
};
