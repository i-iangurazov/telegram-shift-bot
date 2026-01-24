import { prisma } from "../../src/db/prisma";

export const resetDb = async (): Promise<void> => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "EventLog",
      "TelegramUpdateQueue",
      "PendingAction",
      "ShiftViolation",
      "Shift",
      "Employee",
      "Admin",
      "UserSession"
    RESTART IDENTITY CASCADE;
  `);
};

export const disconnectDb = async (): Promise<void> => {
  await prisma.$disconnect();
};
