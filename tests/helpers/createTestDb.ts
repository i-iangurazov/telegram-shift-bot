import { prisma } from "../../src/db/prisma";

export const resetDb = async (): Promise<void> => {
  const raw = process.env.DATABASE_URL!;
  require("./assertTestDatabase.cjs")(raw);
  const schema = new URL(raw).searchParams.get("schema") || "public";
  if (!/^[a-z0-9_]+$/.test(schema)) throw new Error("Invalid test schema");
  // Raw SQL does not inherit Prisma's ?schema= ORM namespace. Qualify every table.
  const tables = ["EventLog", "TelegramUpdateQueue", "PendingAction", "ShiftViolation", "Shift", "Employee", "Admin", "UserSession"];
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map(t => `"${schema}"."${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
};

export const disconnectDb = async (): Promise<void> => {
  await prisma.$disconnect();
};
