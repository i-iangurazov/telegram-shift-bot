import { PendingActionService } from "../../services/pendingActionService";
import { logger } from "../../config/logger";
import { Clock, systemClock } from "../../server/clock";

export const runPendingActionCleanupOnce = async (
  pendingActionService: PendingActionService,
  options?: { now?: Date; limit?: number; clock?: Clock }
): Promise<number> => {
  const now = options?.now ?? options?.clock?.now() ?? systemClock.now();
  const expired = await pendingActionService.expirePendingActions(now, options?.limit);
  if (expired > 0) {
    logger.info({ expired }, "Expired pending actions");
  }
  return expired;
};
