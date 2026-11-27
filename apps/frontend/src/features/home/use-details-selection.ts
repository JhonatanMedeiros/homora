import { useState } from 'react';

/**
 * The service being looked at. With the side column on screen a choice only fills it; without it
 * the choice opens a sheet. A choice made for the column never turns into a sheet by itself when
 * the column goes away, such as on switching to the map.
 */
export function useDetailsSelection(panelled: boolean) {
  const [choice, setChoice] = useState<{ id: number; sheet: boolean } | null>(null);
  return {
    selectedId: choice?.id ?? null,
    sheetId: choice?.sheet && !panelled ? choice.id : null,
    open: (id: number) => setChoice({ id, sheet: !panelled }),
    close: () => setChoice(null),
  };
}
