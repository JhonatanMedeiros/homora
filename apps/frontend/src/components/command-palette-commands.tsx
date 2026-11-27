import {
  FileDown,
  LayoutGrid,
  LayoutList,
  Moon,
  Plus,
  Rows3,
  Search,
  Sparkles,
  ExternalLink,
  Settings2,
} from 'lucide-react';
import { CommandGroup, CommandItem, CommandSeparator, CommandShortcut } from '@homora/ui/command';
import { Kbd } from '@homora/ui/kbd';
import { navItems, navPath } from '@/components/app-nav';
import { chordFor } from '@/lib/shortcuts';
import { settingsPath } from '@/features/settings/sections';
import { t } from '@/i18n';

type Props = {
  state: {
    showCommands: boolean;
    shortcutsEnabled: boolean;
    view: 'tiles' | 'list' | 'cards';
    showDescriptions: boolean;
    searchUrl: string | null;
    searchText: string;
    /** Set when a bang picked the engine (`!g text`). */
    searchEngine?: string;
    aiDestinations: { id: string; label: string; url: string | null }[];
    aiText: string;
  };
  actions: {
    run: (action: () => void) => void;
    onNavigate: (path: string) => void;
    onAddService: () => void;
    onShowMap: () => void;
    onViewChange: (view: 'tiles' | 'list' | 'cards') => void;
    onShowDescriptionsChange: (show: boolean) => void;
    onToggleTheme: () => void;
  };
};

function ShortcutHint({ keys }: { keys?: string[] }) {
  if (!keys) return null;
  return (
    <span className="ml-auto hidden items-center gap-1 md:flex" aria-hidden="true">
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </span>
  );
}

/** Navigation, common actions, and optional web search inside the palette. */
export function CommandPaletteCommands({ state, actions }: Props) {
  const {
    showCommands,
    shortcutsEnabled,
    view,
    showDescriptions,
    searchUrl,
    searchText,
    searchEngine,
    aiDestinations,
    aiText,
  } = state;
  const {
    run,
    onNavigate,
    onAddService,
    onShowMap,
    onViewChange,
    onShowDescriptionsChange,
    onToggleTheme,
  } = actions;

  return (
    <>
      {showCommands && (
        <>
          <CommandSeparator />
          <CommandGroup heading={t('palette.navigate')}>
            {navItems.map((item) => (
              <CommandItem
                key={item.id}
                value={t(item.label)}
                onSelect={() =>
                  run(() => (item.id === 'map' ? onShowMap() : onNavigate(navPath(item.id))))
                }
              >
                <item.icon />
                {t(item.label)}
                {shortcutsEnabled && item.id !== 'map' && <ShortcutHint keys={chordFor(item.id)} />}
              </CommandItem>
            ))}
            <CommandItem
              value={t('palette.importExport')}
              onSelect={() => run(() => onNavigate(settingsPath('backup')))}
            >
              <FileDown />
              {t('palette.importExport')}
            </CommandItem>
            <CommandItem
              value={t('nav.account')}
              onSelect={() => run(() => onNavigate(navPath('account')))}
            >
              <Settings2 />
              {t('nav.account')}
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading={t('palette.actions')}>
            <CommandItem onSelect={() => run(onAddService)}>
              <Plus />
              {t('page.add')}
            </CommandItem>
            <CommandItem onSelect={() => run(() => onViewChange('tiles'))}>
              <Rows3 />
              {t('palette.viewCompact')}
              {view === 'tiles' && <CommandShortcut>{t('palette.current')}</CommandShortcut>}
            </CommandItem>
            <CommandItem onSelect={() => run(() => onViewChange('list'))}>
              <LayoutList />
              {t('palette.viewList')}
              {view === 'list' && <CommandShortcut>{t('palette.current')}</CommandShortcut>}
            </CommandItem>
            <CommandItem onSelect={() => run(() => onViewChange('cards'))}>
              <LayoutGrid />
              {t('palette.viewCards')}
              {view === 'cards' && <CommandShortcut>{t('palette.current')}</CommandShortcut>}
            </CommandItem>
            {view === 'cards' && (
              <CommandItem onSelect={() => run(() => onShowDescriptionsChange(!showDescriptions))}>
                <LayoutGrid />
                {showDescriptions ? t('view.hideDescriptions') : t('view.showDescriptions')}
              </CommandItem>
            )}
            <CommandItem onSelect={() => run(onToggleTheme)}>
              <Moon />
              {t('palette.theme')}
            </CommandItem>
          </CommandGroup>
        </>
      )}
      {searchUrl && (
        <CommandGroup forceMount heading={t('settings.ui.webSearch')}>
          {/* Always listed: it is an action to take with the query, not a result match. */}
          <CommandItem
            forceMount
            value="web-search"
            onSelect={() => run(() => window.open(searchUrl, '_blank', 'noopener,noreferrer'))}
          >
            <Search />
            <span className="min-w-0 flex-1 truncate">
              {searchEngine
                ? t('palette.webSearchWith', { engine: searchEngine, text: searchText })
                : t('palette.webSearch', { text: searchText })}
            </span>
            <ExternalLink aria-hidden="true" />
          </CommandItem>
        </CommandGroup>
      )}
      {aiDestinations.length > 0 && (
        <CommandGroup forceMount heading={t('palette.askAi')}>
          {aiDestinations.map(
            (item) =>
              item.url && (
                <CommandItem
                  key={item.id}
                  forceMount
                  value={`ai-${item.id}`}
                  onSelect={() =>
                    run(() => window.open(item.url!, '_blank', 'noopener,noreferrer'))
                  }
                >
                  <Sparkles />
                  <span className="min-w-0 flex-1 truncate">
                    {t('palette.askAiWith', { engine: item.label, text: aiText })}
                  </span>
                  <ExternalLink aria-hidden="true" />
                </CommandItem>
              ),
          )}
        </CommandGroup>
      )}
    </>
  );
}
