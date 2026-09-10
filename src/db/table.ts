import { Prisma } from "@prisma/client";

/** Prisma qualifies ORM tables, but raw SQL does not inherit URL ?schema=. */
export function table(name: "Employee" | "Shift" | "ShiftViolation" | "TelegramUpdateQueue") {
  const schema = new URL(process.env.DATABASE_URL!).searchParams.get("schema") || "public";
  const quote = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;
  return Prisma.raw(`${quote(schema)}.${quote(name)}`);
}
