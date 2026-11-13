export type PushSource = {
  id: string;
  name: string;
  revoked: number;
  receivedAt: number | null;
  stale: boolean;
};

export type SourceChange = 'revoke' | 'remove' | 'rotate';
