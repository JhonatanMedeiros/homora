import { StatusTag } from '@/components/status-tag';

type Props = {
  online: number;
  down: number;
  blocked: number;
  unknown: number;
};
export function HealthSummary({ online, down, blocked, unknown }: Props) {
  return (
    <div aria-label="Resumo de disponibilidade" className="flex flex-wrap items-center gap-2">
      {online > 0 && <StatusTag state="available" label={`${online} disponíveis`} />}
      {down > 0 && <StatusTag state="unavailable" label={`${down} indisponíveis`} />}
      {unknown > 0 && <StatusTag state="unknown" label={`${unknown} sem informação`} />}
      {blocked > 0 && <StatusTag state="unknown" blocked label={`${blocked} sem monitoramento`} />}
    </div>
  );
}
