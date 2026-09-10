import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

export const formatTime = (date: Date, tz: string): string =>
  dayjs(date).tz(tz).format("HH:mm");

export const formatDate = (date: Date, tz: string): string =>
  dayjs(date).tz(tz).format("DD.MM.YYYY");

export const formatDateTime = (date: Date, tz: string): string =>
  dayjs(date).tz(tz).format("DD.MM.YYYY HH:mm");

export const formatShortDateTime = (date: Date, tz: string): string =>
  dayjs(date).tz(tz).format("DD.MM HH:mm");

export const formatDateForFilename = (date: Date, tz: string): string =>
  dayjs(date).tz(tz).format("YYYY-MM-DD");

export const getDailyCloseTimeForDate = (date: Date, tz: string, closeTime: string): Date => {
  const localDate = dayjs(date).tz(tz).format("YYYY-MM-DD");
  return dayjs.tz(`${localDate} ${closeTime}`, "YYYY-MM-DD HH:mm", tz).toDate();
};

export const getDailyCloseEndTimeForShift = (startTime: Date, tz: string, closeTime: string): Date => {
  const closeAt = getDailyCloseTimeForDate(startTime, tz, closeTime);
  if (closeAt.getTime() >= startTime.getTime()) return closeAt;
  const nextDate = dayjs(startTime).tz(tz).add(1, "day").format("YYYY-MM-DD");
  return dayjs.tz(`${nextDate} ${closeTime}`, "YYYY-MM-DD HH:mm", tz).toDate();
};

export const isDailyCloseDue = (
  startTime: Date,
  now: Date,
  tz: string,
  closeTime: string
): boolean => now.getTime() >= getDailyCloseEndTimeForShift(startTime, tz, closeTime).getTime();

// Excel stores wall-clock serials without a timezone. Convert only at this output boundary.
export const toExcelLocalDate = (date: Date, tz: string): Date => {
  const d = dayjs(date).tz(tz);
  return new Date(Date.UTC(d.year(), d.month(), d.date(), d.hour(), d.minute(), d.second(), d.millisecond()));
};
