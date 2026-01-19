import cron from "node-cron";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { getApp } from "../server/appContainer";
import { runAutoCloseOnce } from "../jobs/tasks/autoCloseTask";
import { runPendingActionCleanupOnce } from "../jobs/tasks/pendingActionCleanupTask";
import { runPhotoRetentionCleanupOnce } from "../jobs/tasks/photoRetentionTask";

const startPollingRunner = async (): Promise<void> => {
  const app = await getApp();

  await runAutoCloseOnce(app.bot, app.shiftService, app.adminService, {
    now: new Date(),
    limit: env.tickMaxAutoclose
  });
  await runPendingActionCleanupOnce(app.pendingActionService, {
    now: new Date(),
    limit: env.tickMaxExpirePending
  });
  await runPhotoRetentionCleanupOnce(app.shiftRepo, {
    now: new Date(),
    limit: env.tickMaxExpirePending
  });

  cron.schedule(
    env.overdueCheckCron,
    async () => {
      try {
        await runAutoCloseOnce(app.bot, app.shiftService, app.adminService, {
          now: new Date(),
          limit: env.tickMaxAutoclose
        });
      } catch (error) {
        logger.error({ err: error }, "Auto-close job failed");
      }
    },
    { timezone: env.timezone }
  );

  cron.schedule(
    env.pendingActionCleanupCron,
    async () => {
      try {
        await runPendingActionCleanupOnce(app.pendingActionService, {
          now: new Date(),
          limit: env.tickMaxExpirePending
        });
      } catch (error) {
        logger.error({ err: error }, "Pending action cleanup failed");
      }
    },
    { timezone: env.timezone }
  );

  cron.schedule(
    env.photoRetentionCron,
    async () => {
      try {
        await runPhotoRetentionCleanupOnce(app.shiftRepo, {
          now: new Date(),
          limit: env.tickMaxExpirePending
        });
      } catch (error) {
        logger.error({ err: error }, "Photo retention cleanup failed");
      }
    },
    { timezone: env.timezone }
  );

  await app.bot.launch({ dropPendingUpdates: true });
  logger.info("Bot started (polling)");

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Shutting down");
    await app.bot.stop(signal);
    await app.prisma.$disconnect();
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
};

startPollingRunner().catch((error) => {
  logger.error({ err: error }, "Failed to start polling runner");
  process.exit(1);
});
