import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Form error region: announced, and empty (no height) when there is no error. */
export function FormError({ className, children, ...props }: ComponentProps<'p'>) {
  return (
    <p
      role="alert"
      className={cn('text-sm font-medium text-destructive empty:hidden', className)}
      {...props}
    >
      {children}
    </p>
  );
}
