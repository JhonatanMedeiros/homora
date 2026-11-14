import { useState } from 'react';

const STORAGE_KEY = 'homora-collapsed-groups';

/**
 * Stores each group's collapsed preference and supports temporary reveal requests.
 * `auto` collapses the group without saving anything ("Collapse healthy groups"); the person can
 * still expand it, and that choice lasts until the page is reloaded.
 */
export function useGroupCollapse(category: string, revealSignal?: number, auto = false) {
  const [saved, setCollapsed] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]').includes(category);
    } catch {
      return false;
    }
  });
  // Expand for a reveal request without persisting it. Updating during render avoids one stale pass.
  const [seenReveal, setSeenReveal] = useState<number | undefined>(undefined);
  const [override, setOverride] = useState<boolean | null>(null);
  if (revealSignal !== seenReveal) {
    setSeenReveal(revealSignal);
    if (revealSignal !== undefined) {
      setCollapsed(false);
      setOverride(false);
    }
  }
  const collapsed = override ?? (saved || auto);

  function toggleCollapsed() {
    const next = !collapsed;
    if (auto) {
      setOverride(next);
      return;
    }
    setOverride(null);
    setCollapsed(next);
    try {
      const current: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
      const names = Array.isArray(current)
        ? current.filter((name): name is string => typeof name === 'string' && name !== category)
        : [];
      if (next) names.push(category);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(names));
    } catch {
      /* preference retained for this session only */
    }
  }

  return { collapsed, toggleCollapsed };
}
