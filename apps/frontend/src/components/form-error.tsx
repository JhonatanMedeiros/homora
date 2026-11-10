import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Região de erro de formulário: anunciada, e vazia (sem altura) quando não há erro. */
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
