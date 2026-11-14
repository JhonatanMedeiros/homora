import { Search, X } from 'lucide-react';
import { useEffect } from 'react';
import { setHomeSearch, useHomeSearch } from '@/lib/home-search';
import { t } from '@/i18n';

/**
 * Live filter for the Home, in the top bar. It narrows the cards as you type; the command palette
 * (Ctrl K or /) stays the way to jump anywhere. Escape clears it.
 */
export function HomeSearchField() {
  const value = useHomeSearch();
  // Leaving the Home forgets the filter, so coming back never shows a mysteriously short list.
  useEffect(() => () => setHomeSearch(''), []);
  return (
    <div className="relative hidden w-56 md:block lg:w-72">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-sidebar-foreground/70"
      />
      <input
        type="search"
        value={value}
        placeholder={t('homeSearch.placeholder')}
        aria-label={t('homeSearch.label')}
        onChange={(event) => setHomeSearch(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) {
            event.stopPropagation();
            setHomeSearch('');
          }
        }}
        className="h-9 w-full rounded-md border border-sidebar-border bg-transparent pr-8 pl-8 text-sm text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/60 focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          aria-label={t('homeSearch.clear')}
          onClick={() => setHomeSearch('')}
          className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-sm text-sidebar-foreground/70 outline-none hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X aria-hidden="true" className="size-3.5" />
        </button>
      )}
    </div>
  );
}
