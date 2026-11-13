export type PublicState = 'up' | 'down' | 'unknown';
export type PublicService = {
  name: string;
  category: string;
  status: PublicState;
  checkedAt: string | null;
  uptime: number | null;
  bars: PublicState[];
};
export type PublicStatus = {
  title: string;
  description?: string;
  updatedAt: string;
  services: PublicService[];
};
