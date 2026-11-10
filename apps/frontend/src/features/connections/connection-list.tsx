import { Button } from '@/components/ui/button';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { ConnectionMark } from './connection-mark';
import { describeData, hostOf, labels, type Connection } from './connection-model';

type Props = {
  items: Connection[];
  busy: boolean;
  confirming: string | null;
  result: { id: number; data: unknown; checkedAt?: string } | null;
  onEdit: (item: Connection) => void;
  onAction: (item: Connection, operation: 'test' | 'data' | 'delete') => void;
  onCancelRemoval: (item: Connection) => void;
};

export function ConnectionList({
  items,
  busy,
  confirming,
  result,
  onEdit,
  onAction,
  onCancelRemoval,
}: Props) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => {
        const confirmingThis = confirming === `connection:${item.id}`;
        return (
          <li key={item.id}>
            <Item variant="outline" className="flex-wrap bg-card">
              <ItemMedia>
                <ConnectionMark type={item.type} />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{item.name}</ItemTitle>
                <ItemDescription>{labels[item.type] ?? item.type}</ItemDescription>
                <span className="font-mono text-[0.8125rem] text-muted-foreground">
                  {hostOf(item.url)}
                </span>
              </ItemContent>
              <ItemActions className="flex-wrap">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => onEdit(item)}
                >
                  Editar {item.name}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => onAction(item, 'test')}
                >
                  Testar {item.name}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => onAction(item, 'data')}
                >
                  Consultar {item.name}
                </Button>
                <Button
                  type="button"
                  variant={confirmingThis ? 'destructive' : 'ghost'}
                  size="sm"
                  disabled={busy}
                  aria-label={
                    confirmingThis ? `Confirmar remoção de ${item.name}` : `Remover ${item.name}`
                  }
                  onClick={() => onAction(item, 'delete')}
                  onBlur={() => onCancelRemoval(item)}
                >
                  {confirmingThis ? 'Confirmar remoção' : 'Remover'}
                </Button>
              </ItemActions>
              {result?.id === item.id && (
                <div className="flex w-full flex-col gap-1 rounded-md bg-muted px-3 py-2 text-sm">
                  <p>
                    Última atualização:{' '}
                    {result.checkedAt
                      ? new Date(result.checkedAt).toLocaleString('pt-BR')
                      : 'não informada'}
                  </p>
                  <p className="font-mono text-[0.8125rem]">
                    {describeData(item.type, result.data) ?? 'O serviço retornou dados inválidos.'}
                  </p>
                </div>
              )}
            </Item>
          </li>
        );
      })}
    </ul>
  );
}
