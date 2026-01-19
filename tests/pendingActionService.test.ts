import { ViolationType } from "@prisma/client";
import { PendingActionService } from "../src/services/pendingActionService";
import { runPhotoRetentionCleanupOnce } from "../src/jobs/photoRetentionJob";
import {
  InMemoryDatabase,
  InMemoryEmployeeRepository,
  InMemoryPendingActionRepository,
  InMemoryShiftRepository
} from "./helpers/inMemoryDb";

const buildService = () => {
  const db = new InMemoryDatabase();
  const employeeRepo = new InMemoryEmployeeRepository(db);
  const shiftRepo = new InMemoryShiftRepository(db);
  const pendingRepo = new InMemoryPendingActionRepository(db);
  const service = new PendingActionService(
    employeeRepo,
    shiftRepo,
    pendingRepo,
    { ttlMinutes: 10, maxShiftHours: 12, minShiftMinutes: 480, shortShiftGraceMinutes: 0 },
    async (fn) => fn(undefined)
  );

  return { db, service, shiftRepo, employeeRepo };
};

describe("PendingActionService", () => {
  it("creates pending action from photo", async () => {
    const { db, service } = buildService();

    const result = await service.createFromPhoto({
      user: { id: 501, username: "user", firstName: "Тест", lastName: "User", chatId: 501 },
      messageId: 10,
      chatId: 501,
      fileId: "file-1",
      messageDate: new Date("2024-01-01T10:00:00Z")
    });

    expect(result.type).toBe("pending");
    expect(db.pendingActions).toHaveLength(1);
  });

  it("confirm creates shift", async () => {
    const { db, service } = buildService();

    const create = await service.createFromPhoto({
      user: { id: 502, username: "user", firstName: "Тест", lastName: "User", chatId: 502 },
      messageId: 11,
      chatId: 502,
      fileId: "file-2",
      messageDate: new Date("2024-01-01T10:00:00Z")
    });

    if (create.type !== "pending") {
      throw new Error("Pending action not created");
    }

    const confirm = await service.confirmAction(create.pendingAction.id, "502", new Date("2024-01-01T10:05:00Z"));
    expect(confirm.type).toBe("confirmed_start");
    expect(db.shifts).toHaveLength(1);
  });

  it("cancel does not create shift", async () => {
    const { db, service } = buildService();

    const create = await service.createFromPhoto({
      user: { id: 503, username: "user", firstName: "Тест", lastName: "User", chatId: 503 },
      messageId: 12,
      chatId: 503,
      fileId: "file-3",
      messageDate: new Date("2024-01-01T10:00:00Z")
    });

    if (create.type !== "pending") {
      throw new Error("Pending action not created");
    }

    const cancel = await service.cancelAction(create.pendingAction.id, "503", new Date("2024-01-01T10:02:00Z"));
    expect(cancel.type).toBe("cancelled");
    expect(db.shifts).toHaveLength(0);
  });

  it("expired pending action rejects confirm", async () => {
    const { db, service } = buildService();

    const create = await service.createFromPhoto({
      user: { id: 504, username: "user", firstName: "Тест", lastName: "User", chatId: 504 },
      messageId: 13,
      chatId: 504,
      fileId: "file-4",
      messageDate: new Date("2024-01-01T10:00:00Z")
    });

    if (create.type !== "pending") {
      throw new Error("Pending action not created");
    }

    const confirm = await service.confirmAction(create.pendingAction.id, "504", new Date("2024-01-01T10:30:00Z"));
    expect(confirm.type).toBe("expired");
    expect(db.shifts).toHaveLength(0);
  });

  it("retention job purges old photo refs", async () => {
    const { db, shiftRepo, employeeRepo } = buildService();
    const employee = await employeeRepo.upsertFromTelegram({
      id: 505,
      username: "user",
      firstName: "Тест",
      lastName: "User",
      chatId: 505
    });

    const startTime = new Date("2024-01-01T08:00:00Z");
    const shift = await shiftRepo.createShiftStart({
      employeeId: employee.id,
      startTime,
      startPhotoFileId: "file-start",
      startMessageId: 1,
      startChatId: "505"
    });

    await shiftRepo.closeShiftByUserPhoto({
      shiftId: shift.id,
      endTime: new Date("2024-01-01T16:00:00Z"),
      endPhotoFileId: "file-end",
      endMessageId: 2,
      endChatId: "505",
      durationMinutes: 480
    });

    await runPhotoRetentionCleanupOnce(shiftRepo, new Date("2024-01-05T00:00:00Z"));

    expect(db.shifts[0].startPhotoFileId).toBeNull();
    expect(db.shifts[0].endPhotoFileId).toBeNull();
    expect(db.shifts[0].photosPurgedAt).not.toBeNull();
  });

  it("confirm end creates short shift violation", async () => {
    const { db, service } = buildService();

    const start = await service.createFromPhoto({
      user: { id: 506, username: "user", firstName: "Тест", lastName: "User", chatId: 506 },
      messageId: 20,
      chatId: 506,
      fileId: "file-start",
      messageDate: new Date("2024-01-01T08:00:00Z")
    });

    if (start.type !== "pending") {
      throw new Error("Pending action not created");
    }

    await service.confirmAction(start.pendingAction.id, "506", new Date("2024-01-01T08:01:00Z"));

    const end = await service.createFromPhoto({
      user: { id: 506, username: "user", firstName: "Тест", lastName: "User", chatId: 506 },
      messageId: 21,
      chatId: 506,
      fileId: "file-end",
      messageDate: new Date("2024-01-01T08:05:00Z")
    });

    if (end.type !== "pending") {
      throw new Error("Pending action not created");
    }

    await service.confirmAction(end.pendingAction.id, "506", new Date("2024-01-01T08:06:00Z"));

    expect(db.violations.some((violation) => violation.type === ViolationType.SHORT_SHIFT)).toBe(true);
  });
});
