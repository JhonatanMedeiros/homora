import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * Assinatura do Homora: tira de fita laminada de rotuladora. Rotula grupos, seções e
 * contagens. Texto preto em caixa-alta sobre fita branca, nos dois temas.
 */
export function LabelTape({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      data-slot="label-tape"
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-[3px] bg-tape px-2 font-label text-[0.8125rem] leading-none font-bold tracking-[0.08em] text-tape-foreground uppercase shadow-[inset_0_0_0_1px_oklch(0_0_0/0.2),0_1px_0_oklch(0_0_0/0.18)] [&_svg]:size-3.5',
        className,
      )}
      {...props}
    />
  );
}
