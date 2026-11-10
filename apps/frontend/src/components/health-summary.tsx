import { StatusTag } from '@/components/status-tag';

type Props = { online: number; down: number; blocked: number; monitored: number };

/** Disponibilidade do painel numa linha de etiquetas, com a dica de rede privada uma vez só. */
export function HealthSummary({ online, down, blocked, monitored }: Props) {
  if (!online && !down && !blocked) return null;
  return (
    <div aria-label="Resumo de disponibilidade" className="flex flex-wrap items-center gap-2">
      {down > 0 && <StatusTag state="unavailable" label={`${down} fora do ar`} />}
      {online > 0 && (
        <StatusTag
          state="available"
          label={down === 0 && online === monitored ? 'Tudo no ar por aqui' : `${online} no ar`}
        />
      )}
      {blocked > 0 && (
        <>
          <StatusTag
            state="unknown"
            blocked
            label={`${blocked} sem monitoramento (rede privada não autorizada)`}
          />
          <small className="text-sm text-muted-foreground">
            Autorize a rede privada em Editar.
          </small>
        </>
      )}
    </div>
  );
}
