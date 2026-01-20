import { Telegraf } from "telegraf";
import { RoleService } from "../../services/roleService";
import { messages } from "../messages";
import { adminKeyboard, employeeKeyboard, roleSwitchKeyboard } from "../keyboards/roleKeyboards";
import { EmployeeRepository } from "../../repositories/employeeRepository";
import { UserSessionRepository } from "../../repositories/userSessionRepository";
import { hasStoredName } from "../../utils/name";

export const registerStartCommand = (
  bot: Telegraf,
  roleService: RoleService,
  employeeRepo: EmployeeRepository,
  userSessionRepo: UserSessionRepository
): void => {
  bot.start(async (ctx) => {
    const from = ctx.from;
    if (!from) {
      return;
    }

    const userId = String(from.id);
    const role = await roleService.resolveRole(userId);

    if (role.isBoth) {
      await ctx.reply(messages.startBoth, roleSwitchKeyboard);
      return;
    }

    if (role.mode === "ADMIN") {
      await ctx.reply(messages.startAdmin, adminKeyboard);
      return;
    }

    const chatId = ctx.chat?.id ?? from.id;
    const employee = await employeeRepo.upsertFromTelegram({
      id: from.id,
      username: from.username,
      firstName: from.first_name,
      lastName: from.last_name,
      chatId
    });

    if (!hasStoredName(employee)) {
      await ctx.reply(messages.namePrompt);
      await userSessionRepo.setNameRequestedAt(userId);
      return;
    }

    await userSessionRepo.clearNameRequestedAt(userId);
    await ctx.reply(messages.startEmployee, employeeKeyboard);
  });
};
