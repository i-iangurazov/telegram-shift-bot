import { EmployeeRoleOverride, UserMode } from "@prisma/client";
import { env } from "../src/config/env";
import { AdminService } from "../src/services/adminService";
import { RoleService } from "../src/services/roleService";
import { PendingActionService } from "../src/services/pendingActionService";
import {
  InMemoryAdminRepository,
  InMemoryDatabase,
  InMemoryEmployeeRepository,
  InMemoryPendingActionRepository,
  InMemoryShiftRepository,
  InMemoryUserSessionRepository
} from "./helpers/inMemoryDb";

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

const buildServices = (adminIds: string[]) => {
  const db = new InMemoryDatabase();
  const employeeRepo = new InMemoryEmployeeRepository(db);
  const shiftRepo = new InMemoryShiftRepository(db);
  const pendingRepo = new InMemoryPendingActionRepository(db);
  const adminRepo = new InMemoryAdminRepository(db);
  const sessionRepo = new InMemoryUserSessionRepository(db);
  env.adminUserIds = adminIds;

  const adminService = new AdminService(adminRepo);
  const roleService = new RoleService(adminService, employeeRepo, sessionRepo);
  const pendingActionService = new PendingActionService(
    employeeRepo,
    shiftRepo,
    pendingRepo,
    { ttlMinutes: 10, maxShiftHours: 12, minShiftMinutes: 480, shortShiftGraceMinutes: 0 },
    async (fn) => fn(undefined)
  );

  return { db, employeeRepo, shiftRepo, adminRepo, sessionRepo, roleService, pendingActionService };
};

const processPhotoIfAllowed = async (params: {
  userId: string;
  roleService: RoleService;
  pendingActionService: PendingActionService;
}) => {
  const role = await params.roleService.resolveRole(params.userId);
  if (!params.roleService.shouldProcessPhoto(role)) {
    return false;
  }

  await params.pendingActionService.createFromPhoto({
    user: {
      id: Number(params.userId),
      username: "user",
      firstName: "Тест",
      lastName: "Пользователь",
      chatId: Number(params.userId)
    },
    messageId: 1,
    chatId: Number(params.userId),
    fileId: "file",
    messageDate: new Date("2024-01-01T10:00:00Z")
  });

  return true;
};

describe("Role routing", () => {
  it("admin-only photo does not start shift", async () => {
    const { db, roleService, pendingActionService } = buildServices(["100"]);

    const processed = await processPhotoIfAllowed({
      userId: "100",
      roleService,
      pendingActionService
    });

    expect(processed).toBe(false);
    expect(db.pendingActions).toHaveLength(0);
  });

  it("employee photo creates pending action", async () => {
    const { db, roleService, pendingActionService } = buildServices(["100"]);

    const processed = await processPhotoIfAllowed({
      userId: "200",
      roleService,
      pendingActionService
    });

    expect(processed).toBe(true);
    expect(db.pendingActions).toHaveLength(1);
  });

  it("both + admin mode photo does not start shift", async () => {
    const { db, roleService, pendingActionService, employeeRepo } = buildServices(["300"]);
    const employee = await employeeRepo.upsertFromTelegram({
      id: 300,
      username: "boss",
      firstName: "Босс",
      lastName: "Тест",
      chatId: 300
    });
    employee.roleOverride = EmployeeRoleOverride.BOTH;

    const processed = await processPhotoIfAllowed({
      userId: "300",
      roleService,
      pendingActionService
    });

    expect(processed).toBe(false);
    expect(db.pendingActions).toHaveLength(0);
  });

  it("both + employee mode photo creates pending action", async () => {
    const { db, roleService, pendingActionService, employeeRepo, sessionRepo } = buildServices(["400"]);
    const employee = await employeeRepo.upsertFromTelegram({
      id: 400,
      username: "boss",
      firstName: "Босс",
      lastName: "Тест",
      chatId: 400
    });
    employee.roleOverride = EmployeeRoleOverride.BOTH;

    await sessionRepo.setSession("400", UserMode.EMPLOYEE);

    const processed = await processPhotoIfAllowed({
      userId: "400",
      roleService,
      pendingActionService
    });

    expect(processed).toBe(true);
    expect(db.pendingActions).toHaveLength(1);
  });
});
