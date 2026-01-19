import { EmployeeRoleOverride, UserMode } from "@prisma/client";
import { AdminService } from "./adminService";
import { EmployeeRepository } from "../repositories/employeeRepository";
import { UserSessionRepository } from "../repositories/userSessionRepository";
import { EmployeeRecord } from "../domain/types";

export interface RoleContext {
  userId: string;
  isAdmin: boolean;
  isEmployee: boolean;
  isBoth: boolean;
  mode: UserMode;
  employee: EmployeeRecord | null;
  roleOverride: EmployeeRoleOverride;
}

export class RoleService {
  constructor(
    private adminService: AdminService,
    private employeeRepo: EmployeeRepository,
    private sessionRepo: UserSessionRepository
  ) {}

  async resolveRole(userId: string): Promise<RoleContext> {
    const roleOverrides = (EmployeeRoleOverride || {
      DEFAULT: "DEFAULT",
      FORCE_EMPLOYEE: "FORCE_EMPLOYEE",
      FORCE_ADMIN: "FORCE_ADMIN",
      BOTH: "BOTH"
    }) as typeof EmployeeRoleOverride;
    const userModes = (UserMode || {
      ADMIN: "ADMIN",
      EMPLOYEE: "EMPLOYEE"
    }) as typeof UserMode;

    const isAdmin = await this.adminService.isAdmin(userId);
    const employee = await this.employeeRepo.findByTelegramUserId(userId);
    const roleOverride = employee?.roleOverride ?? roleOverrides.DEFAULT;
    const isEmployeeActive = employee?.isActive ?? false;

    let isEmployee = false;
    if (!isAdmin) {
      isEmployee = employee ? isEmployeeActive : true;
    } else if (roleOverride === roleOverrides.BOTH || roleOverride === roleOverrides.FORCE_EMPLOYEE) {
      isEmployee = isEmployeeActive;
    }

    if (roleOverride === roleOverrides.FORCE_ADMIN) {
      isEmployee = false;
    }

    const isBoth = isAdmin && isEmployee && roleOverride === roleOverrides.BOTH;

    let mode: UserMode;
    if (isBoth) {
      const session = await this.sessionRepo.getSession(userId);
      mode = session?.mode ?? userModes.ADMIN;
    } else if (isAdmin) {
      mode = userModes.ADMIN;
    } else {
      mode = userModes.EMPLOYEE;
    }

    if (roleOverride === roleOverrides.FORCE_EMPLOYEE && isEmployee) {
      mode = userModes.EMPLOYEE;
    }

    return {
      userId,
      isAdmin,
      isEmployee,
      isBoth,
      mode,
      employee,
      roleOverride
    };
  }

  async setMode(userId: string, mode: UserMode): Promise<void> {
    await this.sessionRepo.setSession(userId, mode);
  }

  shouldProcessPhoto(role: RoleContext): boolean {
    const userModes = (UserMode || {
      ADMIN: "ADMIN",
      EMPLOYEE: "EMPLOYEE"
    }) as typeof UserMode;
    return role.isEmployee && role.mode === userModes.EMPLOYEE;
  }
}
