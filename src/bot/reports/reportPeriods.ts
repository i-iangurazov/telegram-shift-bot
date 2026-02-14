import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

export const REPORT_PERIOD_PRESETS = [
  { key: "3d", label: "За 3 дня" },
  { key: "7d", label: "За 7 дней" },
  { key: "30d", label: "За 30 дней" },
  { key: "current_month", label: "Этот месяц" },
  { key: "previous_month", label: "Прошлый месяц" },
  { key: "12m", label: "За 12 месяцев" }
] as const;

export type ReportPeriodKey = (typeof REPORT_PERIOD_PRESETS)[number]["key"];

export interface ReportRange {
  from: Date;
  to: Date;
  days: number;
}

const periodKeySet = new Set<ReportPeriodKey>(REPORT_PERIOD_PRESETS.map((preset) => preset.key));

const calculateDays = (from: Date, to: Date): number => {
  const diffMs = Math.max(0, to.getTime() - from.getTime());
  return Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
};

export const parseReportPeriodKey = (value: string): ReportPeriodKey | null => {
  if (periodKeySet.has(value as ReportPeriodKey)) {
    return value as ReportPeriodKey;
  }
  return null;
};

export const resolveReportPeriodRange = (params: {
  key: ReportPeriodKey;
  timezone: string;
  now?: Date;
}): ReportRange => {
  const now = params.now ?? new Date();
  const nowTz = dayjs(now).tz(params.timezone);

  if (params.key === "3d") {
    const from = nowTz.subtract(3, "day").toDate();
    return { from, to: now, days: 3 };
  }

  if (params.key === "7d") {
    const from = nowTz.subtract(7, "day").toDate();
    return { from, to: now, days: 7 };
  }

  if (params.key === "30d") {
    const from = nowTz.subtract(30, "day").toDate();
    return { from, to: now, days: 30 };
  }

  if (params.key === "current_month") {
    const from = nowTz.startOf("month").toDate();
    return { from, to: now, days: calculateDays(from, now) };
  }

  if (params.key === "previous_month") {
    const fromTz = nowTz.subtract(1, "month").startOf("month");
    const toTz = fromTz.endOf("month");
    const from = fromTz.toDate();
    const to = toTz.toDate();
    return { from, to, days: calculateDays(from, to) };
  }

  const from = nowTz.subtract(12, "month").toDate();
  return { from, to: now, days: calculateDays(from, now) };
};

export const resolveReportRangeToken = (params: {
  token: string;
  timezone: string;
  now?: Date;
}): { range: ReportRange; periodKey: ReportPeriodKey | null } | null => {
  const periodKey = parseReportPeriodKey(params.token);
  if (periodKey) {
    return {
      range: resolveReportPeriodRange({ key: periodKey, timezone: params.timezone, now: params.now }),
      periodKey
    };
  }

  const days = Number(params.token);
  if (!Number.isFinite(days) || days <= 0) {
    return null;
  }

  const now = params.now ?? new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    range: { from, to: now, days },
    periodKey: null
  };
};
