import { useId, useState } from 'react';
import { Search } from 'lucide-react';
import { Link } from 'react-router';
import { Input } from '@/components/ui/input';
import { t, type MessageKey } from '@/i18n';
import { settingsPath, type SettingsSection } from './sections';

/** Settings worth finding by name: each points at the tab that holds it. */
const entries: { section: SettingsSection; label: MessageKey }[] = [
  { section: 'appearance', label: 'settings.ui.theme' },
  { section: 'appearance', label: 'settings.ui.language' },
  { section: 'appearance', label: 'appearance.accent' },
  { section: 'appearance', label: 'appearance.background' },
  { section: 'appearance', label: 'appearance.image' },
  { section: 'appearance', label: 'appearance.cardOpacity' },
  { section: 'appearance', label: 'appearance.blur' },
  { section: 'appearance', label: 'css.title' },
  { section: 'home', label: 'settings.ui.layout' },
  { section: 'home', label: 'settings.ui.descriptions' },
  { section: 'home', label: 'settings.ui.uptime' },
  { section: 'home', label: 'pages.title' },
  { section: 'topbar', label: 'settings.topBar' },
  { section: 'topbar', label: 'settings.ui.seconds' },
  { section: 'topbar', label: 'settings.ui.hours' },
  { section: 'topbar', label: 'settings.ui.timeZone' },
  { section: 'topbar', label: 'settings.ui.webSearch' },
  { section: 'topbar', label: 'settings.ui.shortcuts' },
  { section: 'alerts', label: 'notifications.webhooks' },
  { section: 'alerts', label: 'notifications.telegram' },
  { section: 'alerts', label: 'settings.monitoring.allowPrivate' },
  { section: 'alerts', label: 'settings.trust.title' },
  { section: 'public', label: 'settings.section.public' },
  { section: 'backup', label: 'settings.section.backup' },
];

const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Type a few letters, jump to the tab that has the setting. */
export function SettingsSearch() {
  const [query, setQuery] = useState('');
  const listId = useId();
  const needle = fold(query.trim());
  const results = needle
    ? entries.filter((entry) => fold(t(entry.label)).includes(needle)).slice(0, 8)
    : [];
  return (
    <div className="relative w-full sm:w-64">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        aria-label={t('settings.search')}
        aria-controls={needle ? listId : undefined}
        placeholder={t('settings.search')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="pl-9"
      />
      {needle && (
        <ul
          id={listId}
          className="absolute top-full right-0 left-0 z-20 mt-1 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">{t('settings.searchEmpty')}</li>
          ) : (
            results.map((entry) => (
              <li key={`${entry.section}-${entry.label}`}>
                <Link
                  to={settingsPath(entry.section)}
                  onClick={() => setQuery('')}
                  className="flex min-h-11 items-center justify-between gap-3 px-3 text-sm hover:bg-accent"
                >
                  <span>{t(entry.label)}</span>
                  <span className="text-xs text-muted-foreground">
                    {t(`settings.section.${entry.section}` as MessageKey)}
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
