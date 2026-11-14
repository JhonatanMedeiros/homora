import {
  FileDown,
  House,
  LayoutGrid,
  LayoutList,
  Moon,
  Plus,
  Rows3,
  Search,
  Settings2,
} from 'lucide-react';
import {
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { Kbd } from '@/components/ui/kbd';
import { navItems, tabPath } from '@/components/app-nav';
import { chordFor } from '@/lib/shortcuts';
import { settingsPath } from '@/features/settings/sections';
import { t } from '@/i18n';

type Props = {
  state: {
    showCommands: boolean;
    shortcutsEnabled: boolean;
    managing: boolean;
    view: 'tiles' | 'list' | 'cards';
    showDescriptions: boolean;
    searchUrl: string | null;
    searchText: string;
    /** Set when a bang picked the engine (`!g text`). */
    searchEngine?: string;
  };
  actions: {
    run: (action: () => void) => void;
    onNavigate: (path: string) => void;
    onAddService: () => void;
    onManageChange: (managing: boolean) => void;
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
    managing,
    view,
    showDescriptions,
    searchUrl,
    searchText,
    searchEngine,
  } = state;
  const {
    run,
    onNavigate,
    onAddService,
    onManageChange,
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
            {navItems
              .filter((item) => item.id !== 'services')
              .map((item) => (
                <CommandItem
                  key={item.id}
                  value={t(item.label)}
                  onSelect={() => run(() => onNavigate(tabPath(item.id)))}
                >
                  <item.icon />
                  {t(item.label)}
                  {shortcutsEnabled && <ShortcutHint keys={chordFor(item.id)} />}
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
              onSelect={() => run(() => onNavigate(tabPath('account')))}
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
            <CommandItem onSelect={() => run(() => onManageChange(!managing))}>
              {managing ? <House /> : <Settings2 />}
              {managing ? t('palette.home') : t('palette.manage')}
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
        <CommandGroup>
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
          </CommandItem>
        </CommandGroup>
      )}
    </>
  );
}
