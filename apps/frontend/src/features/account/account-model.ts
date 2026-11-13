export type Profile = { name: string; email: string; twoFactorEnabled: boolean };

export type AccountSession = {
  id: string;
  browser: string | null;
  os: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
  current: boolean;
};

export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toLocaleUpperCase() || '?';
