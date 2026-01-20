const nameTokenPattern = /^[\p{Script=Latin}\p{Script=Cyrillic}]+(?:-[\p{Script=Latin}\p{Script=Cyrillic}]+)*$/u;

const isBlank = (value?: string | null): boolean => !value || value.trim().length === 0;
const hasFullName = (value?: string | null): boolean => {
  if (isBlank(value)) {
    return false;
  }
  const tokens = value.trim().split(/\s+/);
  if (tokens.length < 2) {
    return false;
  }
  return tokens.every((token) => nameTokenPattern.test(token));
};

export const normalizeFullName = (value: string): { firstName: string; lastName: string; displayName: string } | null => {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length === 0) {
    return null;
  }

  const tokens = normalized.split(" ");
  if (tokens.length < 2) {
    return null;
  }

  if (!tokens.every((token) => nameTokenPattern.test(token))) {
    return null;
  }

  const [firstName, ...rest] = tokens;
  const lastName = rest.join(" ");
  const displayName = `${firstName} ${lastName}`;

  return { firstName, lastName, displayName };
};

export const hasStoredName = (employee: {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
} | null): boolean => {
  if (!employee) {
    return false;
  }

  if (!isBlank(employee.firstName) && !isBlank(employee.lastName)) {
    return true;
  }

  return hasFullName(employee.displayName);
};
