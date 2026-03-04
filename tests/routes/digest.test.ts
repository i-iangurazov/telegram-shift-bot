import { NextRequest } from "next/server";
import { Telegraf } from "telegraf";
import { attachFakeTelegram } from "../helpers/fakeTelegram";
import { getApp } from "../../src/server/appContainer";

jest.mock("../../src/server/appContainer", () => ({
  getApp: jest.fn()
}));

const buildRequest = (url: string, headers?: Record<string, string>) => {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      ...headers
    }
  });
};

beforeEach(() => {
  jest.clearAllMocks();
});

test("rejects missing internal secret", async () => {
  const { POST } = await import("../../src/app/api/internal/digest/route");
  const req = buildRequest("http://localhost/api/internal/digest?type=daily");
  const res = await POST(req);
  expect(res.status).toBe(401);
});

test("daily digest endpoint sends report to boss chat", async () => {
  const mockedGetApp = getApp as jest.MockedFunction<typeof getApp>;
  const bot = new Telegraf("test-token");
  const telegram = attachFakeTelegram(bot);
  const getDailyDigestReport = jest.fn(async () => ({
    type: "daily" as const,
    timezone: "Asia/Bishkek",
    dateKey: "2024-01-10",
    range: {
      from: new Date("2024-01-10T00:00:00+06:00"),
      to: new Date("2024-01-10T23:59:59+06:00")
    },
    employees: [
      {
        employeeId: 1,
        telegramUserId: "9001",
        displayName: "Алия Садыкова",
        shiftsCount: 1,
        firstShiftStart: new Date("2024-01-10T02:00:00Z"),
        lastShiftEnd: new Date("2024-01-10T11:00:00Z"),
        totalDurationMinutes: 540,
        violationsNotClosedInTime: 0
      },
      {
        employeeId: 2,
        telegramUserId: "9002",
        displayName: "Руслан Тураров",
        shiftsCount: 1,
        firstShiftStart: new Date("2024-01-10T04:00:00Z"),
        lastShiftEnd: null,
        totalDurationMinutes: 0,
        violationsNotClosedInTime: 0
      }
    ],
    totals: {
      totalEmployees: 2,
      totalShifts: 2,
      totalDurationMinutes: 540,
      violationsNotClosedInTime: 0,
      notClosedEmployees: 1
    }
  }));

  mockedGetApp.mockResolvedValue({
    bot,
    digestService: {
      getDailyDigestReport,
      getWeeklyDigestReport: jest.fn()
    }
  } as unknown as Awaited<ReturnType<typeof getApp>>);

  const { POST } = await import("../../src/app/api/internal/digest/route");

  const req = buildRequest("http://localhost/api/internal/digest?type=daily&date=2024-01-10", {
    Authorization: "Bearer test-internal"
  });
  const res = await POST(req);
  expect(res.status).toBe(200);

  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.type).toBe("daily");
  expect(body.dateKey).toBe("2024-01-10");
  expect(getDailyDigestReport).toHaveBeenCalledTimes(1);
  expect(getDailyDigestReport.mock.calls[0]?.[0]).toMatchObject({ timezone: "Asia/Bishkek" });
  expect(getDailyDigestReport.mock.calls[0]?.[0]?.date).toBeInstanceOf(Date);

  const sentText = telegram.getMessages().map((call) => String(call.payload?.text ?? "")).join("\n");
  expect(sentText).toContain("Дневной отчёт");
  expect(sentText).toContain("Алия Садыкова");
  expect(sentText).toContain("Руслан Тураров");
  expect(sentText).toContain("Итого: сотрудников 2, смен 2");
});
