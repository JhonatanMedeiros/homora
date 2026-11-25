import { useState } from 'react';

const KEY = 'homora-map-connections';

/** Whether dependency arrows are drawn; saved in this browser and on by default. */
export function useMapConnections() {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(KEY) !== 'off';
    } catch {
      return true;
    }
  });
  const set = (next: boolean) => {
    setOn(next);
    try {
      localStorage.setItem(KEY, next ? 'on' : 'off');
    } catch {
      // Applies to this page session only.
    }
  };
  return [on, set] as const;
}
