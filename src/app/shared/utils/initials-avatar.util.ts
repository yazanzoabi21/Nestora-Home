export interface InitialsAvatar {
  initials: string;
  backgroundColor: string;
  textColor: string;
}

const AVATAR_PALETTE: Array<Pick<InitialsAvatar, 'backgroundColor' | 'textColor'>> = [
  { backgroundColor: '#eef4e8', textColor: '#4f6338' },
  { backgroundColor: '#edf4ff', textColor: '#315f9f' },
  { backgroundColor: '#fff6e7', textColor: '#98610d' },
  { backgroundColor: '#f0fdfa', textColor: '#0f766e' },
  { backgroundColor: '#fef2f2', textColor: '#a33a32' },
  { backgroundColor: '#f5f3ff', textColor: '#6654a8' },
  { backgroundColor: '#fdf2f8', textColor: '#a43d71' },
  { backgroundColor: '#f8fafc', textColor: '#475569' },
];

export function getInitialsAvatar(name: string | null | undefined, stableSeed?: string | null): InitialsAvatar {
  const initials = getInitials(name);
  const seed = normalizeSeed(stableSeed) || normalizeSeed(name) || initials;
  const colors = AVATAR_PALETTE[hashString(seed) % AVATAR_PALETTE.length];

  return {
    initials,
    backgroundColor: colors.backgroundColor,
    textColor: colors.textColor,
  };
}

export function getInitials(name: string | null | undefined): string {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return 'CU';
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase() || 'CU';
}

function normalizeSeed(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

function hashString(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}
