import { useState } from 'react';
import { Search } from 'lucide-react';
import { integrationDefinitions } from '@homora/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ConnectionMark } from './connection-mark';
import { labels, type Kind } from './connection-model';
import { t, tOr } from '@/i18n';

type Props = {
  /** Connections already registered, by type. */
  counts: Partial<Record<Kind, number>>;
  onPick: (type: Kind) => void;
};

const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/**
 * First step of adding a connection: find the type, then fill in its form. The catalog grows with
 * every integration, so the list is searchable (by name or by what it reads) and scrolls inside
 * the dialog, with the search field staying in view.
 */
export function ConnectionPicker({ counts, onPick }: Props) {
  const [query, setQuery] = useState('');
  const entries = integrationDefinitions
    .map(({ type, capabilities }) => ({
      type,
      name: labels[type] ?? type,
      description: capabilities
        .map((capability) => tOr(`catalog.${capability}`, capability))
        .join(', '),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const needle = fold(query.trim());
  const matches = needle
    ? entries.filter((entry) => fold(`${entry.name} ${entry.description}`).includes(needle))
    : entries;
  return (
    <section aria-label={t('connections.pickTitle')} className="flex flex-col gap-3">
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          autoFocus
          aria-label={t('connections.pickSearch')}
          placeholder={t('connections.pickSearch')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            // Enter picks the only match, so keyboard users can type a name and go on.
            if (event.key === 'Enter' && matches.length === 1) {
              event.preventDefault();
              onPick(matches[0]!.type);
            }
          }}
          className="pl-9"
        />
      </div>
      <p role="status" className="text-xs text-muted-foreground">
        {needle
          ? t('connections.pickResults', { count: matches.length, total: entries.length })
          : ''}
      </p>
      {matches.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          {t('connections.pickEmpty', { query: query.trim() })}
        </p>
      ) : (
        <ScrollArea className="max-h-[50svh] pr-3">
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {matches.map(({ type, name, description }) => {
              const count = counts[type] ?? 0;
              return (
                <li key={type} className="flex min-w-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onPick(type)}
                    className="h-auto w-full min-w-0 justify-start gap-3 p-3 text-left whitespace-normal"
                  >
                    <ConnectionMark type={type} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium">{name}</span>
                      {description && (
                        <span className="text-sm font-normal text-muted-foreground">
                          {description}
                        </span>
                      )}
                    </span>
                    {count > 0 && (
                      <Badge variant="secondary" className="shrink-0 font-mono">
                        {t('connections.connectedCount', { count })}
                      </Badge>
                    )}
                  </Button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      )}
    </section>
  );
}
