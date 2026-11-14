import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { shortcutAllowed } from './review-shortcuts';

/** How long a risky approval must be held. */
export const HOLD_MS = 900;

/**
 * The approve button of a proposal or batch. A routine change applies with a single click. A
 * risky one (removal, revoked or widened access) is confirmed by holding the button for about a
 * second, so a stray click or tap cannot apply it. A pointer or keyboard hold shows progress; a
 * plain activation without a hold (assistive technology, for instance) asks in a dialog instead.
 * With `shortcut`, pressing that key outside a field does the same as using the button.
 */
export function ApproveButton({
  confirm,
  description,
  title,
  actionLabel,
  variant,
  disabled,
  shortcut,
  onApprove,
  children,
}: {
  /** Risky: hold to approve, with a dialog as the alternative for a plain activation. */
  confirm: boolean;
  description: string;
  title?: string;
  actionLabel?: string;
  variant?: 'default' | 'outline' | 'destructive';
  disabled?: boolean;
  /** A single key, such as "a", that approves from anywhere on the page. */
  shortcut?: string;
  onApprove: () => void;
  children: ReactNode;
}) {
  const [holding, setHolding] = useState(false);
  const [asking, setAsking] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const approve = useRef(onApprove);
  useEffect(() => {
    approve.current = onApprove;
  });

  const stop = () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    setHolding(false);
  };
  const start = () => {
    if (disabled || timer.current !== undefined) return;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      setHolding(false);
      approve.current();
    }, HOLD_MS);
  };
  // A button that turns disabled or leaves the page cannot finish a hold it started.
  useEffect(() => stop, [disabled]);

  useEffect(() => {
    if (!shortcut || disabled) return;
    const down = (event: globalThis.KeyboardEvent) => {
      if (event.key.toLowerCase() !== shortcut || event.repeat || !shortcutAllowed(event)) return;
      if (confirm) start();
      else approve.current();
    };
    const up = (event: globalThis.KeyboardEvent) => {
      if (event.key.toLowerCase() === shortcut) stop();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      stop();
    };
    // `start` only reads refs and `disabled`, which this effect already depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcut, disabled, confirm]);

  const hint = shortcut && (
    <Kbd aria-hidden="true" className="max-lg:hidden">
      {shortcut.toUpperCase()}
    </Kbd>
  );

  if (!confirm)
    return (
      <Button type="button" variant={variant} disabled={disabled} onClick={onApprove}>
        {children}
        {hint}
      </Button>
    );

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (!event.repeat) start();
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    stop();
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        disabled={disabled}
        data-holding={holding || undefined}
        className="relative touch-manipulation overflow-hidden select-none [-webkit-touch-callout:none]"
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={stop}
        // A real click ends a hold that was too short; only a click with no pointer (assistive
        // technology) asks in a dialog.
        onClick={(event) => {
          if (event.detail === 0) setAsking(true);
        }}
      >
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-y-0 left-0 w-0 bg-foreground/20',
            holding && 'w-full transition-[width] duration-[900ms] ease-linear',
          )}
        />
        <span className="relative inline-flex items-center gap-2">
          {children}
          {hint}
        </span>
      </Button>
      <AlertDialog open={asking} onOpenChange={setAsking}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title ?? t('proposal.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={onApprove}>
              {actionLabel ?? t('proposal.confirmAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
