import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

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
