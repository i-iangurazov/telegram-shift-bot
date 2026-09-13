import {
  parseReportPeriodKey,
  resolveReportPeriodRange,
  resolveReportRangeToken
} from "../src/bot/reports/reportPeriods";

describe("reportPeriods", () => {
  it("parses known period keys", () => {
    expect(parseReportPeriodKey("30d")).toBe("30d");
    expect(parseReportPeriodKey("50d")).toBe("50d");
    expect(parseReportPeriodKey("current_month")).toBe("current_month");
    expect(parseReportPeriodKey("previous_month")).toBe("previous_month");
    expect(parseReportPeriodKey("unknown")).toBeNull();
  });

  it("resolves 50 days across the year boundary in Bishkek for reports and exports", () => {
    const now = new Date("2026-01-01T18:01:23.456Z");
    const resolved = resolveReportRangeToken({ token: "50d", timezone: "Asia/Bishkek", now });

    expect(resolved?.periodKey).toBe("50d");
    expect(resolved?.range.days).toBe(50);
    expect(resolved?.range.from.toISOString()).toBe("2025-11-12T18:01:23.456Z");
    expect(resolved?.range.to).toEqual(now);
    expect(resolved!.range.to.getTime() - resolved!.range.from.getTime()).toBe(50 * 24 * 60 * 60 * 1000);
  });

  it("builds current and previous month ranges", () => {
    const now = new Date("2026-02-14T12:30:00.000Z");

    const currentMonth = resolveReportPeriodRange({
      key: "current_month",
      timezone: "UTC",
      now
    });
    expect(currentMonth.from.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(currentMonth.to.toISOString()).toBe("2026-02-14T12:30:00.000Z");

    const previousMonth = resolveReportPeriodRange({
      key: "previous_month",
      timezone: "UTC",
      now
    });
    expect(previousMonth.from.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(previousMonth.to.toISOString()).toBe("2026-01-31T23:59:59.999Z");
  });

  it("supports 12-month and legacy day tokens", () => {
    const now = new Date("2026-02-14T12:30:00.000Z");

    const yearly = resolveReportRangeToken({
      token: "12m",
      timezone: "UTC",
      now
    });
    expect(yearly?.range.from.toISOString()).toBe("2025-02-14T12:30:00.000Z");
    expect(yearly?.periodKey).toBe("12m");

    const legacy = resolveReportRangeToken({
      token: "30",
      timezone: "UTC",
      now
    });
    expect(legacy?.range.days).toBe(30);
    expect(legacy?.periodKey).toBeNull();
  });
});
