import { CHECK_TYPES, type CheckType } from '@homora/shared';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';

/**
 * The kind of check as a set of tiles (a radio group): picking one changes the fields the form
 * shows below. Arrow keys move between tiles like any radio group.
 */
export function CheckTypePicker({
  value,
  onChange,
  id,
}: {
  value: CheckType;
  onChange: (value: CheckType) => void;
  id?: string;
}) {
  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={t('form.checkType')}
      className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2"
      onKeyDown={(event) => {
        const step =
          event.key === 'ArrowRight' || event.key === 'ArrowDown'
            ? 1
            : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
              ? -1
              : 0;
        if (!step) return;
        event.preventDefault();
        const next =
          CHECK_TYPES[
            (CHECK_TYPES.indexOf(value) + step + CHECK_TYPES.length) % CHECK_TYPES.length
          ];
        if (!next) return;
        onChange(next);
        event.currentTarget.querySelector<HTMLElement>(`[data-check-type="${next}"]`)?.focus();
      }}
    >
      {CHECK_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          role="radio"
          aria-checked={value === type}
          tabIndex={value === type ? 0 : -1}
          data-check-type={type}
          onClick={() => onChange(type)}
          className={cn(
            'flex min-h-16 flex-col items-start gap-0.5 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 pointer-coarse:min-h-14',
            value === type && 'border-primary bg-primary/10 hover:bg-primary/15',
          )}
        >
          <span className="text-sm font-medium">{t(`check.type.${type}`)}</span>
          <span className="text-xs text-muted-foreground">{t(`check.type.${type}.desc`)}</span>
        </button>
      ))}
    </div>
  );
}
