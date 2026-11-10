import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { SectionTitle } from '@/components/section-title';
import { ConnectionMark } from './connection-mark';
import { describeData, labels, type Connection, type IntegrationWidget } from './connection-model';
import { EmptyNote } from '@/components/empty-note';
import { NativeSelect } from '@/components/native-select';

type Props = {
  items: Connection[] | null;
  widgets: IntegrationWidget[];
  busy: boolean;
  confirming: string | null;
  widgetName: string;
  widgetConnection: string;
  widgetResult: { id: number; data: unknown } | null;
  onNameChange: (value: string) => void;
  onConnectionChange: (value: string) => void;
  onCreate: (event: FormEvent) => void;
  onQuery: (widget: IntegrationWidget) => void;
  onRemove: (widget: IntegrationWidget) => void;
  onCancelRemoval: (widget: IntegrationWidget) => void;
};

export function WidgetsSection({
  items,
  widgets,
  busy,
  confirming,
  widgetName,
  widgetConnection,
  widgetResult,
  onNameChange,
  onConnectionChange,
  onCreate,
  onQuery,
  onRemove,
  onCancelRemoval,
}: Props) {
  return (
    <section aria-labelledby="integration-widgets-title" className="flex flex-col gap-3">
      <SectionTitle id="integration-widgets-title">Widgets</SectionTitle>
      <p className="text-sm text-muted-foreground">
        Atalhos para informações importantes das suas conexões. Os dados são fornecidos pelo serviço
        conectado.
      </p>
      {items && items.length > 0 && (
        <form onSubmit={onCreate}>
          <FieldGroup className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field>
              <FieldLabel htmlFor="widget-connection">Conexão</FieldLabel>
              <NativeSelect
                id="widget-connection"
                required
                value={widgetConnection}
                onChange={(event) => onConnectionChange(event.target.value)}
              >
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="widget-name">Nome do widget</FieldLabel>
              <Input
                id="widget-name"
                required
                maxLength={80}
                value={widgetName}
                onChange={(event) => onNameChange(event.target.value)}
              />
            </Field>
            <Button type="submit" disabled={busy}>
              Criar widget
            </Button>
          </FieldGroup>
        </form>
      )}
      {widgets.length === 0 ? (
        <EmptyNote>Nenhum widget cadastrado ainda.</EmptyNote>
      ) : (
        <ul className="flex flex-col gap-2">
          {widgets.map((widget) => {
            const connection = items?.find((item) => item.id === widget.integrationId);
            const confirmingThis = confirming === `widget:${widget.id}`;
            return (
              <li key={widget.id}>
                <Item variant="outline" className="flex-wrap bg-card">
                  <ItemMedia>
                    <ConnectionMark type={widget.type} />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{widget.name}</ItemTitle>
                    <ItemDescription>
                      {connection?.name ?? labels[widget.type] ?? widget.type}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions className="flex-wrap">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy || !connection}
                      onClick={() => onQuery(widget)}
                    >
                      Consultar {widget.name}
                    </Button>
                    <Button
                      type="button"
                      variant={confirmingThis ? 'destructive' : 'ghost'}
                      size="sm"
                      disabled={busy}
                      aria-label={
                        confirmingThis
                          ? `Confirmar remoção do widget ${widget.name}`
                          : `Remover widget ${widget.name}`
                      }
                      onClick={() => onRemove(widget)}
                      onBlur={() => onCancelRemoval(widget)}
                    >
                      {confirmingThis ? 'Confirmar remoção' : 'Remover'}
                    </Button>
                  </ItemActions>
                  {widgetResult?.id === widget.id && (
                    <p className="w-full rounded-md bg-muted px-3 py-2 font-mono text-[0.8125rem]">
                      {describeData(widget.type, widgetResult.data) ??
                        'O serviço retornou dados inválidos.'}
                    </p>
                  )}
                </Item>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
