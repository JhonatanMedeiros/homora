import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { RISK_LABELS, type Risk } from './proposal-risk';

const TONE: Record<Risk, { text: string; dot: string }> = {
  low: { text: 'text-success', dot: 'bg-success' },
  attention: { text: 'text-warning', dot: 'bg-warning' },
  access: { text: 'text-info', dot: 'bg-info' },
  destructive: { text: 'text-destructive', dot: 'bg-destructive' },
};

/** The risk of a proposal as a light and a word: the color is never alone. */
export function RiskLabel({ risk, className }: { risk: Risk; className?: string }) {
  return (
    <span
      data-slot="risk-label"
      data-risk={risk}
      className={cn(
        'inline-flex w-fit items-center gap-1.5 text-xs font-medium whitespace-nowrap',
        TONE[risk].text,
        className,
      )}
    >
      <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', TONE[risk].dot)} />
      {t(RISK_LABELS[risk])}
    </span>
  );
}
