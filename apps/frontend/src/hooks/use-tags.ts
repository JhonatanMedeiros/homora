import { useCallback, useEffect, useState } from 'react';
import type { TagsOverview } from '@homora/shared';

/** Tags of every service. Auxiliary: when they cannot be loaded the dashboard just shows none. */
export function useTags() {
  const [tags, setTags] = useState<Record<number, string[]>>({});
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    fetch('/api/tags')
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<TagsOverview>;
      })
      .then((data) => {
        if (active && data && typeof data.tags === 'object' && data.tags) setTags(data.tags);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [version]);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  return { tags, reload };
}
