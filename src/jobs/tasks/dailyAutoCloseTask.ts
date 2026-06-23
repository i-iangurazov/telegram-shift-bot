import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { ShiftService } from "../../services/shiftService";
import { Clock, systemClock } from "../../server/clock";

export interface DailyAutoCloseSummary {
  autoClosed: number;
}

export const runDailyAutoCloseOnce = async (
  shiftService: ShiftService,
  options?: { now?: Date; limit?: number; clock?: Clock }
): Promise<DailyAutoCloseSummary> => {
  const now = options?.now ?? options?.clock?.now() ?? systemClock.now();
  const results = await shiftService.dailyAutoCloseOpenShifts(
    {
      closeTime: env.dailyAutoCloseTime,
      timezone: env.timezone
    },
    now,
    options?.limit
  );

  if (results.length > 0) {
    logger.info({ autoClosed: results.length }, "Daily auto-closed open shifts");
  }

  return { autoClosed: results.length };
};
