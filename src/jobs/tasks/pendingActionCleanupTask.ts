import { PendingActionService } from "../../services/pendingActionService";
import { logger } from "../../config/logger";

export const runPendingActionCleanupOnce = async (
  pendingActionService: PendingActionService,
  options?: { now?: Date; limit?: number }
): Promise<number> => {
  const now = options?.now ?? new Date();
  const expired = await pendingActionService.expirePendingActions(now, options?.limit);
  if (expired > 0) {
    logger.info({ expired }, "Expired pending actions");
  }
  return expired;
};
