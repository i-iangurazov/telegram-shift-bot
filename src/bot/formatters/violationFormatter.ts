import { ViolationType } from "@prisma/client";

const violationLabels: Partial<Record<ViolationType, string>> = {
  NOT_CLOSED_IN_TIME: "Не закрыл(а) смену вовремя"
};

const filterVisibleViolations = (violations: ViolationType[]): ViolationType[] =>
  violations.filter((type) => type !== ViolationType.SHORT_SHIFT);

export const formatViolationsList = (violations: ViolationType[]): string => {
  const visible = filterVisibleViolations(violations);
  if (visible.length === 0) {
    return "нет";
  }
  const list = visible.map((type) => violationLabels[type] ?? String(type)).join(", ");
  return `${list} ⚠️`;
};

export const formatViolationsPresence = (violations: ViolationType[]): string => {
  const visible = filterVisibleViolations(violations);
  if (visible.length === 0) {
    return "Нарушения: нет";
  }
  return `Нарушения: есть (${visible.length}) ⚠️`;
};
