import { useEffect, useState, type ComponentProps } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@homora/ui/button';
import { t } from '@/i18n';

/** Copies `text` to the clipboard and confirms with a check for two seconds. */
export function CopyButton({
  text,
  label,
  doneLabel,
  onFailed,
  ...props
}: {
  text: string;
  label: string;
  doneLabel?: string;
  onFailed?: () => void;
} & Omit<ComponentProps<typeof Button>, 'onClick' | 'children'>) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => setDone(false), 2000);
    return () => window.clearTimeout(timer);
  }, [done]);
  return (
    <Button
      type="button"
      variant="outline"
      {...props}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
        } catch {
          onFailed?.();
        }
      }}
    >
      {done ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
      <span>{done ? (doneLabel ?? t('settings.copied')) : label}</span>
    </Button>
  );
}
