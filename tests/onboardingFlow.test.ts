import { Telegraf, Telegram } from "telegraf";
import { AdminService } from "../src/services/adminService";
import { RoleService } from "../src/services/roleService";
import { PendingActionService } from "../src/services/pendingActionService";
import { registerStartCommand } from "../src/bot/handlers/startCommand";
import { registerTextHandler } from "../src/bot/handlers/textHandler";
import { registerFullNameCommand } from "../src/bot/handlers/fullNameCommand";
import { messages } from "../src/bot/messages";
import {
  InMemoryAdminRepository,
  InMemoryDatabase,
  InMemoryEmployeeRepository,
  InMemoryPendingActionRepository,
  InMemoryShiftRepository,
  InMemoryUserSessionRepository
} from "./helpers/inMemoryDb";

let replySink: string[] = [];
let sendMessageSpy: jest.SpyInstance | null = null;

beforeAll(() => {
  sendMessageSpy = jest.spyOn(Telegram.prototype, "sendMessage").mockImplementation(async (_chatId, text: string) => {
    replySink.push(text);
    return {} as never;
  });
});

afterAll(() => {
  sendMessageSpy?.mockRestore();
  sendMessageSpy = null;
});

const buildBot = () => {
  const db = new InMemoryDatabase();
  const employeeRepo = new InMemoryEmployeeRepository(db);
  const adminRepo = new InMemoryAdminRepository(db);
  const sessionRepo = new InMemoryUserSessionRepository(db);
  const shiftRepo = new InMemoryShiftRepository(db);
  const pendingRepo = new InMemoryPendingActionRepository(db);

  const adminService = new AdminService(adminRepo);
  const roleService = new RoleService(adminService, employeeRepo, sessionRepo);
  const pendingActionService = new PendingActionService(
    employeeRepo,
    shiftRepo,
    pendingRepo,
    { ttlMinutes: 10, maxShiftHours: 12, minShiftMinutes: 480, shortShiftGraceMinutes: 0 },
    async (fn) => fn(undefined)
  );

  const bot = new Telegraf("test-token");
  const botInfo = { id: 1, is_bot: true, first_name: "TestBot", username: "testbot" };
  (bot as unknown as { botInfo?: typeof botInfo }).botInfo = botInfo;
  const replies: string[] = [];
  replySink = replies;

  registerStartCommand(bot, roleService, employeeRepo, sessionRepo);
  registerFullNameCommand(bot, roleService, employeeRepo, sessionRepo);
  registerTextHandler(bot, roleService, employeeRepo, sessionRepo, pendingActionService);

  return { bot, replies, employeeRepo, adminRepo, sessionRepo };
};

const sendTextUpdate = async (bot: Telegraf, params: {
  userId: number;
  text: string;
  firstName?: string;
  lastName?: string;
  username?: string;
}): Promise<void> => {
  const commandPart = params.text.startsWith("/") ? params.text.split(" ")[0] : null;
  const entities = commandPart
    ? [{ offset: 0, length: commandPart.length, type: "bot_command" as const }]
    : undefined;

  await bot.handleUpdate({
    update_id: Date.now(),
    message: {
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      chat: { id: params.userId, type: "private" },
      from: {
        id: params.userId,
        is_bot: false,
        first_name: params.firstName ?? "Тест",
        last_name: params.lastName,
        username: params.username
      },
      text: params.text,
      entities
    }
  } as never);
};

describe("Employee onboarding", () => {
  it("prompts for full name on /start when missing", async () => {
    const { bot, replies, sessionRepo } = buildBot();

    await sendTextUpdate(bot, { userId: 100, text: "/start", firstName: "Ильяс" });

    expect(replies).toEqual(["✅ DEBUG: /start reached", messages.namePrompt]);
    const session = await sessionRepo.getSession("100");
    expect(session?.nameRequestedAt).not.toBeNull();
  });

  it("saves name and shows employee start message", async () => {
    const { bot, replies, employeeRepo, sessionRepo } = buildBot();

    await sendTextUpdate(bot, { userId: 101, text: "/start", firstName: "Ильяс" });
    replies.length = 0;

    await sendTextUpdate(bot, { userId: 101, text: "Ильяс Янгуразов", firstName: "Ильяс" });

    expect(replies).toEqual([
      messages.nameSaved("Ильяс Янгуразов"),
      messages.startEmployee
    ]);
    const employee = await employeeRepo.findByTelegramUserId("101");
    expect(employee?.displayName).toBe("Ильяс Янгуразов");
    const session = await sessionRepo.getSession("101");
    expect(session?.nameRequestedAt ?? null).toBeNull();
  });

  it("skips prompt after name is saved", async () => {
    const { bot, replies } = buildBot();

    await sendTextUpdate(bot, { userId: 102, text: "/start", firstName: "Ильяс" });
    await sendTextUpdate(bot, { userId: 102, text: "Ильяс Янгуразов", firstName: "Ильяс" });
    replies.length = 0;

    await sendTextUpdate(bot, { userId: 102, text: "/start", firstName: "Ильяс" });

    expect(replies).toEqual(["✅ DEBUG: /start reached", messages.startEmployee]);
  });

  it("does not prompt admins", async () => {
    const { bot, replies, adminRepo } = buildBot();
    await adminRepo.addAdminUserId("200");

    await sendTextUpdate(bot, { userId: 200, text: "/start", firstName: "Админ", lastName: "Тест" });

    expect(replies).toEqual(["✅ DEBUG: /start reached", messages.startAdmin]);
  });
});

describe("Employee fullname command", () => {
  it("prompts and updates full name", async () => {
    const { bot, replies, employeeRepo, sessionRepo } = buildBot();

    await sendTextUpdate(bot, { userId: 300, text: "/fullname", firstName: "Ильяс" });
    expect(replies).toEqual([messages.fullNamePrompt]);

    replies.length = 0;
    await sendTextUpdate(bot, { userId: 300, text: "Ilias Iangurazov", firstName: "Ильяс" });

    expect(replies).toEqual([messages.fullNameSaved("Ilias Iangurazov")]);
    const employee = await employeeRepo.findByTelegramUserId("300");
    expect(employee?.displayName).toBe("Ilias Iangurazov");
    const session = await sessionRepo.getSession("300");
    expect(session?.fullNameRequestedAt ?? null).toBeNull();
  });

  it("rejects admin-only users", async () => {
    const { bot, replies, adminRepo } = buildBot();
    await adminRepo.addAdminUserId("400");

    await sendTextUpdate(bot, { userId: 400, text: "/fullname", firstName: "Админ" });

    expect(replies).toEqual([messages.fullNameNotEmployee]);
  });
});
