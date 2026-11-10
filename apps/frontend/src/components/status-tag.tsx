import { CircleCheck, CircleHelp, CircleX, ShieldOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Availability } from '@/lib/services';

type Props = { state: Availability; blocked?: boolean; label?: string; className?: string };

const view = {
  available: {
    label: 'Disponível',
    Icon: CircleCheck,
    tone: 'bg-success text-success-foreground',
  },
  unavailable: {
    label: 'Indisponível',
    Icon: CircleX,
    tone: 'bg-destructive text-destructive-foreground',
  },
  unknown: {
    label: 'Sem informação',
    Icon: CircleHelp,
    tone: 'bg-muted text-muted-foreground ring-1 ring-inset ring-border',
  },
  blocked: {
    label: 'Monitoramento bloqueado',
    Icon: ShieldOff,
    tone: 'bg-muted text-muted-foreground ring-1 ring-inset ring-border',
  },
} as const;

/** Estado de um serviço como etiqueta de fita: ícone, texto e cor, nunca só cor. */
export function StatusTag({ state, blocked = false, label: custom, className }: Props) {
  const { label, Icon, tone } = view[blocked ? 'blocked' : state];
  return (
    <span
      data-slot="status-tag"
      data-state={blocked ? 'blocked' : state}
      className={cn(
        'inline-flex h-6 w-fit items-center gap-1.5 rounded-[3px] px-2 font-label text-[0.8125rem] leading-none font-bold tracking-[0.06em] uppercase [&_svg]:size-3.5',
        tone,
        className,
      )}
    >
      <Icon aria-hidden="true" />
      {custom ?? label}
    </span>
  );
}
