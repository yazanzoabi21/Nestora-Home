export interface SplitName {
  firstName: string;
  lastName: string;
}

export function splitFullName(fullName: string | null | undefined): SplitName {
  const parts = String(fullName ?? '').trim().split(/\s+/).filter(Boolean);

  return {
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
  };
}
