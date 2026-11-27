import { useSyncExternalStore } from 'react';
import type { Proposal } from '@/features/agents/agent-model';

export const PROPOSALS_POLL_MS = 15_000;

let proposals: Proposal[] | null = null;
const listeners = new Set<() => void>();
let timer: number | undefined;
let expiryTimer: number | undefined;
let version = 0;
let paused = false;

function notify() {
  for (const listener of listeners) listener();
}

export function publishProposals(next: Proposal[]) {
  proposals = next;
  window.clearTimeout(expiryTimer);
  const now = Date.now();
  const expiry = next.reduce(
    (earliest, item) =>
      (item.state === 'pending' || item.state === 'stale') && item.expiresAt > now
        ? Math.min(earliest, item.expiresAt)
        : earliest,
    Infinity,
  );
  if (Number.isFinite(expiry)) {
    expiryTimer = window.setTimeout(() => publishProposals([...next]), Math.max(0, expiry - now));
  }
  notify();
}

export function pauseProposalPolling(value: boolean) {
  paused = value;
  version += 1;
}

export async function refreshProposals(force = false) {
  if (paused && !force) return;
  const current = ++version;
  try {
    const response = await fetch('/api/proposals');
    if (!response.ok) throw new Error();
    const data: unknown = await response.json();
    if (!Array.isArray(data)) throw new TypeError();
    if (current === version && (!paused || force)) publishProposals(data as Proposal[]);
  } catch {
    throw new Error('Could not load proposals');
  }
}

function onVisible() {
  if (document.visibilityState === 'visible') void refreshProposals().catch(() => {});
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    void refreshProposals().catch(() => {});
    timer = window.setInterval(onVisible, PROPOSALS_POLL_MS);
    document.addEventListener('visibilitychange', onVisible);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.clearInterval(timer);
      window.clearTimeout(expiryTimer);
      document.removeEventListener('visibilitychange', onVisible);
      version += 1;
      proposals = null;
    }
  };
}

const getSnapshot = () => proposals;
const getEmptySnapshot = () => null;
const subscribeDisabled = () => () => {};

export function useProposals(enabled = true) {
  return useSyncExternalStore(
    enabled ? subscribe : subscribeDisabled,
    enabled ? getSnapshot : getEmptySnapshot,
  );
}

/** All badges and the review page derive their counts from the same snapshot. */
export function usePendingProposals(_refreshKey: string, enabled: boolean) {
  const snapshot = useProposals(enabled);
  const now = Date.now();
  return (snapshot ?? []).filter(
    (item) => (item.state === 'pending' || item.state === 'stale') && item.expiresAt > now,
  ).length;
}
