import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { StatusFilter } from '@/features/dashboard/status-filter-model';

export type NodeFilter = { connectionId: number; node: string } | null;

/**
 * What the Home sidebar narrows the Services view to. It lives above the views, so choosing a view
 * on the Summary or on Maintenance still holds when Services opens. It is not saved.
 */
export function useBrowseState(activePageId: number) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [nodeFilter, setNodeFilter] = useState<NodeFilter>(null);
  // A group belongs to a page: switching pages shows every group again.
  const [selectedState, setSelectedState] = useState<{ pageId: number; category: string | null }>({
    pageId: activePageId,
    category: null,
  });
  const selected = selectedState.pageId === activePageId ? selectedState.category : null;
  const setSelected: Dispatch<SetStateAction<string | null>> = useCallback(
    (value) =>
      setSelectedState((previous) => ({
        pageId: activePageId,
        category:
          typeof value === 'function'
            ? value(previous.pageId === activePageId ? previous.category : null)
            : value,
      })),
    [activePageId],
  );
  return {
    statusFilter,
    setStatusFilter,
    favoritesOnly,
    setFavoritesOnly,
    nodeFilter,
    setNodeFilter,
    selected,
    setSelected,
  };
}

export type BrowseState = ReturnType<typeof useBrowseState>;
