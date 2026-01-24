import { prisma } from "../../src/db/prisma";
import { PrismaEmployeeRepository } from "../../src/repositories/employeeRepository";
import { PrismaAdminRepository } from "../../src/repositories/adminRepository";
import { PrismaUserSessionRepository } from "../../src/repositories/userSessionRepository";
import { AdminService } from "../../src/services/adminService";
import { RoleService } from "../../src/services/roleService";
import { resetDb, disconnectDb } from "../helpers/createTestDb";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnectDb();
});

test("creates employee on first interaction and stores display name", async () => {
  const employeeRepo = new PrismaEmployeeRepository();
  const employee = await employeeRepo.upsertFromTelegram({
    id: 101,
    username: "worker101",
    firstName: "Ivan",
    lastName: "Petrov",
    chatId: 101
  });

  expect(employee.telegramUserId).toBe("101");
  expect(employee.displayName).toContain("Ivan");
  expect(employee.displayName).toContain("Petrov");

  const fetched = await prisma.employee.findUnique({ where: { telegramUserId: "101" } });
  expect(fetched).not.toBeNull();
});

test("admin user is not treated as employee by default", async () => {
  const adminRepo = new PrismaAdminRepository();
  const employeeRepo = new PrismaEmployeeRepository();
  const sessionRepo = new PrismaUserSessionRepository();
  const adminService = new AdminService(adminRepo);
  const roleService = new RoleService(adminService, employeeRepo, sessionRepo);

  await adminRepo.addAdminUserId("500");

  const role = await roleService.resolveRole("500");
  expect(role.isAdmin).toBe(true);
  expect(role.isEmployee).toBe(false);
});
