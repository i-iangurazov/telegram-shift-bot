import { Telegraf } from "telegraf";
import { ShiftService } from "../../services/shiftService";
import { RoleService } from "../../services/roleService";
import { messages } from "../messages";
import { env } from "../../config/env";
import { formatTime } from "../../utils/time";

export const registerStatusCommand = (
  bot: Telegraf,
  shiftService: ShiftService,
  roleService: RoleService
): void => {
  const handleStatus = async (
    userId: string,
    reply: (text: string) => Promise<unknown>
  ): Promise<void> => {
    const role = await roleService.resolveRole(userId);
    if (!role.isEmployee || role.mode !== "EMPLOYEE") {
      await reply(messages.notEmployee);
      return;
    }

    const openShift = await shiftService.getOpenShiftStatus(userId);
    if (!openShift) {
      await reply(messages.noOpenShift);
      return;
    }

    const time = formatTime(openShift.startTime, env.timezone);
    await reply(messages.openShift(time));
  };

  bot.command("status", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) {
      return;
    }

    await handleStatus(String(userId), (text) => ctx.reply(text));
  });

  bot.hears("Статус", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) {
      return;
    }

    await handleStatus(String(userId), (text) => ctx.reply(text));
  });
};
