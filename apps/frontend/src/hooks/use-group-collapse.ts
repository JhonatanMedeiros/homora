import { useState } from 'react';

const STORAGE_KEY = 'homora-collapsed-groups';

/** Stores each group's collapsed preference and supports temporary reveal requests. */
export function useGroupCollapse(category: string, revealSignal?: number) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]').includes(category);
    } catch {
      return false;
    }
  });
  // Expand for a reveal request without persisting it. Updating during render avoids one stale pass.
  const [seenReveal, setSeenReveal] = useState<number | undefined>(undefined);
  if (revealSignal !== seenReveal) {
    setSeenReveal(revealSignal);
    if (revealSignal !== undefined) setCollapsed(false);
  }

  function toggleCollapsed() {
    const next = !collapsed;
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
