import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { t } from '@/i18n';
import { needsReview } from '@homora/integrations/resources/client';
import type { CardResource } from '@/hooks/use-resource-links';
import { ResourceStateBadge, type ResourceDisplayState } from '@/components/resource-state';

const stateOf = (info: CardResource): ResourceDisplayState =>
  info.view.kind === 'found' ? info.view.resource.state : info.view.kind;

/**
 * The state the integration reports for the linked resource, on its own line so it is never confused with
 * the HTTP availability. Text is always shown; "unavailable" means the read failed, not "offline".
 */
export function ResourceLine({ info, onOpen }: { info: CardResource; onOpen: () => void }) {
  const review = needsReview(info.view) || info.view.kind === 'missing';
  return (
    <div className="relative z-10 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <span>{t('resources.cardLabel')}</span>
      <ResourceStateBadge state={stateOf(info)} />
      {needsReview(info.view) && <Badge variant="destructive">{t('resources.needsReview')}</Badge>}
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto p-0 text-xs"
        onClick={onOpen}
      >
        {review ? t('resources.review') : t('resources.details')}
      </Button>
    </div>
  );
}
