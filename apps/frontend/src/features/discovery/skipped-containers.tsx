import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { t } from '@/i18n';
import type { Skipped } from './local-discovery-model';

/**
 * Containers that were read but cannot be suggested because they carry no address label. They
 * are listed only to explain their absence; Homora never guesses an address or port for them.
 */
export function SkippedContainers({ skipped, total }: { skipped: Skipped[]; total: number }) {
  if (total === 0) return null;
  return (
    <Collapsible className="rounded-lg border bg-card">
      <CollapsibleTrigger className="flex min-h-11 w-full items-center justify-between gap-2 px-4 text-left text-sm font-medium">
        {t('discovery.skippedTitle', { count: total })}
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-3 px-4 pb-4">
        <p className="text-sm text-muted-foreground">{t('discovery.skippedHint')}</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs break-all">
          {skipped.map((item) => (
            <li key={item.id}>{item.container}</li>
          ))}
        </ul>
        {total > skipped.length && (
          <p className="text-sm text-muted-foreground">
            {t('discovery.skippedMore', { count: total - skipped.length })}
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
