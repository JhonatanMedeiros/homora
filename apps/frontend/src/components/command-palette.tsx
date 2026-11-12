import { useMemo, useState } from 'react';
import type { Service } from '@homora/shared';
import {
  ArrowRight,
  FileDown,
  House,
  LayoutGrid,
  LayoutList,
  Moon,
  Plus,
  Settings2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { Kbd } from '@/components/ui/kbd';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { StatusLight } from '@/components/status-light';
import { navItems, tabPath } from '@/components/app-nav';
import { settingsPath } from '@/features/settings/sections';
import { t } from '@/i18n';
import { useRecentServices } from '@/hooks/use-recent-services';
import type { View } from '@/hooks/use-view-preferences';
import {
  filterServices,
  parseQuery,
  score,
  searchFields,
  sortServices,
  type PaletteSort,
} from '@/lib/palette-search';
import { hostOf, type ServiceStatus } from '@/lib/services';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  services: Service[];
  statuses: Record<number, ServiceStatus>;
  blockedIds: Set<number>;
  managing: boolean;
  onManageChange: (managing: boolean) => void;
  onAddService: () => void;
  onToggleTheme: () => void;
  /** Navigates inside the app (read-only destinations; the palette never writes). */
  onNavigate: (path: string) => void;
  /** Closes the palette and scrolls to the service's card on the dashboard. */
  onGoToCard: (service: Service) => void;
  view: View;
  onViewChange: (view: View) => void;
  showDescriptions: boolean;
  onShowDescriptionsChange: (show: boolean) => void;
};

const SORTS: {
  id: PaletteSort;
  label: 'palette.sortRelevance' | 'palette.sortName' | 'palette.sortStatus';
}[] = [
  { id: 'relevance', label: 'palette.sortRelevance' },
  { id: 'name', label: 'palette.sortName' },
  { id: 'status', label: 'palette.sortStatus' },
];

const itemService = (value: string) => /^(?:service|recent)-(\d+)$/.exec(value)?.[1];

/** Ctrl/Cmd K or the header button: find a service, jump to it or to a section, run a common action. */
export function CommandPalette({
  open,
  onOpenChange,
  services,
  statuses,
  blockedIds,
  managing,
  onManageChange,
  onAddService,
  onToggleTheme,
  onNavigate,
  onGoToCard,
  view,
  onViewChange,
  showDescriptions,
  onShowDescriptionsChange,
}: Props) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<PaletteSort>('relevance');
  const [highlighted, setHighlighted] = useState('');
  const { recent, remember } = useRecentServices();

  const parsed = useMemo(() => parseQuery(search), [search]);
  const visible = useMemo(
    () => sortServices(filterServices(services, statuses, blockedIds, parsed), statuses, sort),
    [services, statuses, blockedIds, parsed, sort],
  );
  const recentServices = useMemo(
    () =>
      recent
        .map((id) => services.find((service) => service.id === id))
        .filter((service): service is Service => Boolean(service)),
    [recent, services],
  );
  // Recents are a shortcut for the empty palette; once the person types they are just noise.
  const showRecent = !search.trim() && recentServices.length > 0;
  // With a status or group prefix the person is listing services, not looking for commands.
  const showCommands = !parsed.filtered;

  const changeOpen = (next: boolean) => {
    if (!next) {
      setSearch('');
      setHighlighted('');
    }
    onOpenChange(next);
  };
  const run = (action: () => void) => {
    changeOpen(false);
    action();
  };
  const openService = (service: Service) =>
    run(() => {
      remember(service.id);
      window.open(service.url, '_blank', 'noopener,noreferrer');
    });
  const goToCard = (service: Service) =>
    run(() => {
      remember(service.id);
      onGoToCard(service);
    });

  const renderService = (service: Service, prefix: 'service' | 'recent') => {
    const state = statuses[service.id]?.status ?? 'unknown';
    return (
      <CommandItem
        key={`${prefix}-${service.id}`}
        value={`${prefix}-${service.id}`}
        keywords={[searchFields(service)]}
        onSelect={() => openService(service)}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{service.name}</span>
          <span className="block truncate font-mono text-xs text-muted-foreground">
            {service.category} · {hostOf(service.url)}
          </span>
        </span>
        <StatusLight state={state} blocked={blockedIds.has(service.id) && state !== 'available'} />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          tabIndex={-1}
          aria-label={t('palette.goToCard', { name: service.name })}
          title={t('palette.goToCard', { name: service.name })}
          onClick={(event) => {
            event.stopPropagation();
            goToCard(service);
          }}
        >
          <ArrowRight aria-hidden="true" />
        </Button>
      </CommandItem>
    );
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={changeOpen}
      title={t('palette.title')}
      description={t('palette.placeholder')}
      showCloseButton={false}
      commandProps={{
        value: highlighted,
        onValueChange: setHighlighted,
        // Prefixes are removed before ranking. With a custom sort every match ties, so the DOM order wins.
        filter: (value, query, keywords) => {
          const text = parseQuery(query).text;
          const found = score(`${value} ${keywords?.join(' ') ?? ''}`, text);
          return sort === 'relevance' || !found ? found : 1;
        },
        onKeyDown: (event) => {
          if (event.key !== 'Enter' || !event.shiftKey) return;
          const id = itemService(highlighted);
          const service = id && services.find((item) => item.id === Number(id));
          if (!service) return;
          // Stops cmdk from also running the item's default action (open in a new tab).
          event.preventDefault();
          goToCard(service);
        },
      }}
    >
      <CommandInput
        placeholder={t('palette.placeholder')}
        value={search}
        onValueChange={setSearch}
      />
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <span className="font-mono text-xs text-muted-foreground">{t('palette.sort')}</span>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={sort}
          onValueChange={(value) => {
            const next = SORTS.find((item) => item.id === value);
            if (next) setSort(next.id);
          }}
          aria-label={t('palette.sort')}
        >
          {SORTS.map((item) => (
            <ToggleGroupItem key={item.id} value={item.id} className="px-2.5 text-xs">
              {t(item.label)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <CommandList>
        <CommandEmpty>{t('palette.empty')}</CommandEmpty>
        {showRecent && (
          <CommandGroup heading={t('palette.recent')}>
            {recentServices.map((service) => renderService(service, 'recent'))}
          </CommandGroup>
        )}
        {visible.length > 0 && (
          <CommandGroup heading={t('palette.services')}>
            {visible.map((service) => renderService(service, 'service'))}
          </CommandGroup>
        )}
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
                <CommandItem
                  onSelect={() => run(() => onShowDescriptionsChange(!showDescriptions))}
                >
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
      </CommandList>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t px-3 py-2 text-xs text-muted-foreground">
        <span className="font-mono">{t('palette.filters')}</span>
        <span className="hidden items-center gap-1.5 md:flex">
          <Kbd>↵</Kbd> {t('palette.hintOpen')}
          <Kbd>⇧ ↵</Kbd> {t('palette.hintCard')}
        </span>
      </div>
    </CommandDialog>
  );
}
