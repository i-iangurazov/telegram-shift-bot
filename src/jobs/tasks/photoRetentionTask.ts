import { env } from "../../config/env";
import { ShiftRepository } from "../../repositories/shiftRepository";
import { logger } from "../../config/logger";
import { Clock, systemClock } from "../../server/clock";

export const runPhotoRetentionCleanupOnce = async (
  shiftRepo: ShiftRepository,
  options?: { now?: Date; limit?: number; clock?: Clock }
): Promise<number> => {
  const now = options?.now ?? options?.clock?.now() ?? systemClock.now();
  const cutoff = new Date(now.getTime() - env.photoRetentionDays * 24 * 60 * 60 * 1000);
  const purged = await shiftRepo.purgeOldPhotos(cutoff, now, options?.limit);
  if (purged > 0) {
    logger.info({ purged }, "Purged old shift photos");
  }
  return purged;
};
