import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { t } from '@/i18n';
import { needsReview } from '@/lib/coolify';
import type { CardCoolify } from '@/hooks/use-resource-links';
import { CoolifyStateBadge, type CoolifyDisplayState } from '@/components/coolify-state';

const stateOf = (info: CardCoolify): CoolifyDisplayState =>
  info.view.kind === 'found' ? info.view.resource.state : info.view.kind;

/**
 * The state Coolify reports for the linked resource, on its own line so it is never confused with
 * the HTTP availability. Text is always shown; "unavailable" means the read failed, not "offline".
 */
export function CoolifyLine({ info, onOpen }: { info: CardCoolify; onOpen: () => void }) {
  const review = needsReview(info.view) || info.view.kind === 'missing';
  return (
    <div className="relative z-10 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <span>{t('coolify.cardLabel')}</span>
      <CoolifyStateBadge state={stateOf(info)} />
      {needsReview(info.view) && <Badge variant="destructive">{t('coolify.needsReview')}</Badge>}
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto p-0 text-xs"
        onClick={onOpen}
      >
        {review ? t('coolify.review') : t('coolify.details')}
      </Button>
    </div>
  );
}
