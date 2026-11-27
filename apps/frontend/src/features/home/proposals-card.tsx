import { Bot } from 'lucide-react';
import { Button } from '@homora/ui/button';
import { Card, CardContent } from '@homora/ui/card';
import { cn } from '@homora/ui/lib/utils';
import { t } from '@/i18n';

/** Agent proposals waiting for a person, and the way to review them. */
export function ProposalsCard({
  pending,
  onReview,
  className,
}: {
  pending: number;
  onReview: () => void;
  className?: string;
}) {
  return (
    <Card className={cn('gap-2', className)}>
      <CardContent className="flex flex-col items-start gap-2">
        <p className="flex items-center gap-2 text-sm">
          <Bot aria-hidden="true" className="size-4 shrink-0 text-accent-text" />
          {pending === 0
            ? t('summarygrid.proposals.empty')
            : pending === 1
              ? t('panel.proposals.one')
              : t('panel.proposals.other', { count: pending })}
        </p>
        {pending > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={onReview}>
            {t('panel.proposals.review')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
