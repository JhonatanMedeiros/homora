import { useState } from 'react';
import { cn } from '@homora/ui/lib/utils';

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Called once when the last digit is entered or a full code is pasted. */
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
};

/**
 * One-time code shown as separate boxes. A single real input sits on top, so typing, pasting,
 * autofill (`one-time-code`), screen readers and the form label all behave like a normal field.
 */
export function OtpInput({ id, value, onChange, onComplete, length = 6, disabled }: Props) {
  const [focused, setFocused] = useState(false);
  const active = Math.min(value.length, length - 1);

  return (
    <div className="relative" data-slot="otp-input">
      <div className="flex gap-2" aria-hidden="true">
        {Array.from({ length }, (_, index) => (
          <span
            key={index}
            data-active={focused && index === active ? 'true' : undefined}
            className={cn(
              'grid h-12 min-w-0 flex-1 place-items-center rounded-lg border bg-card font-mono text-xl transition-colors',
              'data-[active=true]:border-ring data-[active=true]:ring-3 data-[active=true]:ring-ring/50',
              disabled && 'opacity-50',
            )}
          >
            {value[index] ?? ''}
          </span>
        ))}
      </div>
      <input
        id={id}
        autoFocus
        required
        disabled={disabled}
        autoComplete="one-time-code"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={length}
        spellCheck={false}
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(event) => {
          const next = event.target.value.replace(/\D/g, '').slice(0, length);
          onChange(next);
          if (next.length === length) onComplete?.(next);
        }}
        className="absolute inset-0 size-full cursor-text opacity-0"
      />
    </div>
  );
}
