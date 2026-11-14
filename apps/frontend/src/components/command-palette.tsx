import { useMemo, useState } from 'react';
import { linkLabel, linkOpenTarget, type Service, type ServiceLink } from '@homora/shared';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Kbd } from '@/components/ui/kbd';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { StatusLight } from '@/components/status-light';
import { useWebSearchPreferences } from '@/hooks/use-web-search-preferences';
import { buildSearchUrl, parseBang } from '@/lib/web-search';
import { t } from '@/i18n';
import { useRecentServices } from '@/hooks/use-recent-services';
import type { View } from '@/features/dashboard/use-view-preferences';
import {
  filterServices,
  parseQuery,
  score,
  searchFields,
  sortServices,
  type PaletteSort,
} from '@/lib/palette-search';
import { hostOf, type ServiceStatus } from '@/lib/services';
import { LINK_COLOR_CLASS, openAddress } from '@/lib/service-links';
import { cn } from '@/lib/utils';
import { CommandPaletteCommands } from './command-palette-commands';

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
  /** Name of the page a service's group is on; undefined with a single page. */
  pageName?: (service: Service) => string | undefined;
  view: View;
  onViewChange: (view: View) => void;
  showDescriptions: boolean;
  onShowDescriptionsChange: (show: boolean) => void;
  /** Shows the `g` + letter hints on the navigation rows. */
  shortcutsEnabled?: boolean;
};

const SORTS: {
  id: PaletteSort;
  label: 'palette.sortRelevance' | 'palette.sortName' | 'palette.sortStatus';
}[] = [
  { id: 'relevance', label: 'palette.sortRelevance' },
  { id: 'name', label: 'palette.sortName' },
  { id: 'status', label: 'palette.sortStatus' },
];

/** At most this many extra addresses of one service show in the palette; the card has them all. */
const PALETTE_LINKS_MAX = 4;
const linkText = (link: ServiceLink) => `${linkLabel(link)} ${link.type?.name ?? ''} ${link.url}`;

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
  pageName,
  view,
  onViewChange,
  showDescriptions,
  onShowDescriptionsChange,
  shortcutsEnabled = false,
}: Props) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<PaletteSort>('relevance');
  const [highlighted, setHighlighted] = useState('');
  const { recent, remember } = useRecentServices();
  const webSearch = useWebSearchPreferences();

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

  // Only the free text the person typed: prefixes (status:, group:) never leave the browser.
  const bang = webSearch.enabled ? parseBang(parsed.text) : null;
  const searchUrl = bang
    ? buildSearchUrl(bang.template, bang.text)
    : webSearch.template
      ? buildSearchUrl(webSearch.template, parsed.text)
      : null;

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
      openAddress(service.url, service.openTarget === 'same-tab' ? 'same-tab' : 'new-tab');
    });
  const openLink = (service: Service, link: ServiceLink) =>
    run(() => {
      remember(service.id);
      openAddress(link.url, linkOpenTarget(service, link));
    });
  const goToCard = (service: Service) =>
    run(() => {
      remember(service.id);
      onGoToCard(service);
    });

  /** Extra addresses sit right under their service while searching; the empty palette stays short. */
  const renderLinks = (service: Service) =>
    parsed.text
      ? (service.links ?? []).slice(0, PALETTE_LINKS_MAX).map((link) => (
          <CommandItem
            key={`extra-${service.id}-${link.id}`}
            value={`extra-${service.id}-${link.id}`}
            keywords={[searchFields(service), linkText(link)]}
            onSelect={() => openLink(service, link)}
            className="pl-7"
          >
            {link.type ? (
              <span
                className={cn(
                  'w-14 shrink-0 truncate rounded-sm px-1.5 py-0.5 text-center text-[0.625rem] font-semibold tracking-wider uppercase',
                  LINK_COLOR_CLASS[link.type.color],
                )}
              >
                {link.type.name}
              </span>
            ) : (
              <span aria-hidden="true" className="w-14 shrink-0" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate">
                {service.name} · {linkLabel(link)}
              </span>
              <span className="block truncate font-mono text-xs text-muted-foreground">
                {link.url.replace(/^https?:\/\//, '')}
              </span>
            </span>
          </CommandItem>
        ))
      : null;

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
            {pageName?.(service) ? `${pageName(service)} · ` : ''}
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
          // An extra address ranks exactly like its service when the service matches (so it stays
          // right under it, DOM order breaking the tie), and by its own text otherwise.
          const found = value.startsWith('extra-')
            ? score(
                `service-${/^extra-(\d+)-/.exec(value)?.[1] ?? ''} ${keywords?.[0] ?? ''}`,
                text,
              ) || score(keywords?.[1] ?? '', text)
            : score(`${value} ${keywords?.join(' ') ?? ''}`, text);
          return sort === 'relevance' || !found ? found : 1;
        },
        onKeyDown: (event) => {
          if (event.key !== 'Enter' || !event.shiftKey) return;
          const id = itemService(highlighted);
          const service = id && services.find((item) => item.id === Number(id));
          if (!service) return;
          // Stops cmdk from also running the item's default action (open the service).
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
            {visible.flatMap((service) => [
              renderService(service, 'service'),
              renderLinks(service),
            ])}
          </CommandGroup>
        )}
        <CommandPaletteCommands
          state={{
            showCommands,
            shortcutsEnabled,
            managing,
            view,
            showDescriptions,
            searchUrl,
            searchText: bang ? bang.text : parsed.text,
            searchEngine: bang?.label,
          }}
          actions={{
            run,
            onNavigate,
            onAddService,
            onManageChange,
            onViewChange,
            onShowDescriptionsChange,
            onToggleTheme,
          }}
        />
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
