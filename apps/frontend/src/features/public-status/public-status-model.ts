export type PublicState = 'up' | 'down' | 'unknown';
export type PublicService = {
  name: string;
  category: string;
  status: PublicState;
  checkedAt: string | null;
  uptime: number | null;
  bars: PublicState[];
  /** One state per day, oldest first. Absent on a server that predates the 90-day view. */
  days?: PublicState[];
  uptime90?: number | null;
};
export type PublicIncident = { name: string; startedAt: string; endedAt: string | null };
export type PublicMaintenance = { name: string; startsAt: string; endsAt: string; active: boolean };
export type PublicStatus = {
  title: string;
  description?: string;
  updatedAt: string;
  services: PublicService[];
  incidents?: PublicIncident[];
  maintenance?: PublicMaintenance[];
};
