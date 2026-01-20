import { Telegraf } from "telegraf";
import { messages } from "../messages";
import { RoleService } from "../../services/roleService";
import { EmployeeRepository } from "../../repositories/employeeRepository";
import { UserSessionRepository } from "../../repositories/userSessionRepository";
import { PendingActionService } from "../../services/pendingActionService";
import { hasStoredName, normalizeFullName } from "../../utils/name";
import { employeeKeyboard } from "../keyboards/roleKeyboards";

export const registerTextHandler = (
  bot: Telegraf,
  roleService: RoleService,
  employeeRepo: EmployeeRepository,
  userSessionRepo: UserSessionRepository,
  pendingActionService: PendingActionService
): void => {
  bot.on("message", async (ctx) => {
    const message = ctx.message;
    if (!message) {
      return;
    }

    if ("photo" in message) {
      return;
    }

    if ("text" in message && message.text.startsWith("/")) {
      return;
    }

    if ("text" in message) {
      const knownButtons = [
        "Помощь",
        "Статус",
        "Сотрудники",
        "Отчёт",
        "Режим: Админ",
        "Режим: Сотрудник"
      ];
      if (knownButtons.includes(message.text)) {
        return;
      }
    }

    const userId = ctx.from?.id;
    if (!userId) {
      return;
    }

    const userIdText = String(userId);
    const session = await userSessionRepo.getSession(userIdText);
    if (session?.nameRequestedAt && "text" in message) {
      const employee = await employeeRepo.findByTelegramUserId(userIdText);
      if (hasStoredName(employee)) {
        await userSessionRepo.clearNameRequestedAt(userIdText);
      } else {
        const hasPending = await pendingActionService.hasActivePendingAction(userIdText);
        if (!hasPending) {
          const parsed = normalizeFullName(message.text);
          if (!parsed) {
            await ctx.reply(messages.nameInvalid);
            return;
          }

          let updated = await employeeRepo.updateNameByTelegramUserId(userIdText, parsed);
          if (!updated && ctx.from) {
            const chatId = ctx.chat?.id ?? ctx.from.id;
            await employeeRepo.upsertFromTelegram({
              id: ctx.from.id,
              username: ctx.from.username,
              firstName: ctx.from.first_name,
              lastName: ctx.from.last_name,
              chatId
            });
            updated = await employeeRepo.updateNameByTelegramUserId(userIdText, parsed);
          }

          if (!updated) {
            return;
          }

          await userSessionRepo.clearNameRequestedAt(userIdText);
          await ctx.reply(messages.nameSaved(parsed.displayName));
          await ctx.reply(messages.startEmployee, employeeKeyboard);
          return;
        }
      }
    }

    const role = await roleService.resolveRole(userIdText);
    if (role.mode === "ADMIN") {
      await ctx.reply(messages.instructionAdmin);
      return;
    }

    await ctx.reply(messages.instructionEmployee);
  });
};
