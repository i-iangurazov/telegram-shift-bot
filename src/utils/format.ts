import { ClosedReason } from "@prisma/client";

export const formatDurationMinutes = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours} ч ${mins} мин`;
};

export const formatClosedReason = (reason: ClosedReason | null): string => {
  if (reason === ClosedReason.AUTO_TIMEOUT) {
    return "AUTO_TIMEOUT";
  }
  if (reason === ClosedReason.USER_PHOTO) {
    return "USER_PHOTO";
  }
  return "UNKNOWN";
};
