import { ViolationType } from "@prisma/client";

const violationLabels: Record<ViolationType, string> = {
  NOT_CLOSED_IN_TIME: "Не закрыл(а) смену вовремя",
  SHORT_SHIFT: "Смена меньше 8 часов"
};

export const formatViolationsList = (violations: ViolationType[]): string => {
  if (violations.length === 0) {
    return "нет";
  }
  const list = violations.map((type) => violationLabels[type] ?? String(type)).join(", ");
  return `${list} ⚠️`;
};

export const formatViolationsPresence = (violations: ViolationType[]): string => {
  if (violations.length === 0) {
    return "Нарушения: нет";
  }
  return `Нарушения: есть (${violations.length}) ⚠️`;
};
