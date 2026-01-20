import { Telegraf } from "telegraf";
import { RoleService } from "../../services/roleService";
import { EmployeeRepository } from "../../repositories/employeeRepository";
import { UserSessionRepository } from "../../repositories/userSessionRepository";
import { messages } from "../messages";

export const registerFullNameCommand = (
  bot: Telegraf,
  roleService: RoleService,
  employeeRepo: EmployeeRepository,
  userSessionRepo: UserSessionRepository
): void => {
  bot.command("fullname", async (ctx) => {
    const from = ctx.from;
    if (!from) {
      return;
    }

    const userId = String(from.id);
    const role = await roleService.resolveRole(userId);
    if (!role.isEmployee) {
      await ctx.reply(messages.fullNameNotEmployee);
      return;
    }

    const chatId = ctx.chat?.id ?? from.id;
    await employeeRepo.upsertFromTelegram({
      id: from.id,
      username: from.username,
      firstName: from.first_name,
      lastName: from.last_name,
      chatId
    });

    await userSessionRepo.setFullNameRequestedAt(userId, new Date());
    await ctx.reply(messages.fullNamePrompt);
  });
};
