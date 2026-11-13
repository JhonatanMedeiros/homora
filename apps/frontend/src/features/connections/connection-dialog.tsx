import { Button } from '@/components/ui/button';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { hasInventoryDomain } from '@homora/integrations';
import { t } from '@/i18n';
import { ConnectionDetail } from './connection-detail';
import { ConnectionForm } from './connection-form';
import { ConnectionPicker } from './connection-picker';
import { hostOf, labels, newForm as newFormOf, type Connection } from './connection-model';
import type { useConnectionsPage } from './use-connections-page';

type State = ReturnType<typeof useConnectionsPage>;

/**
 * The one dialog (a bottom sheet on phones) for everything done to a connection: pick a type,
 * fill in its form, see how it is doing, test it, edit it or remove it. The steps swap inside it.
 */
export function ConnectionDialog({ state }: { state: State }) {
  const { form, picking, selected, discarding, confirmingRemoval } = state;
  const open = picking || form !== null || selected !== null;
  const widgetCount = selected
    ? state.widgets.filter((widget) => widget.integrationId === selected.id).length
    : 0;

  let title = '';
  let description: string | undefined;
  if (discarding) title = t('connections.discardTitle');
  else if (form)
    title =
      state.editing !== null
        ? t('card.edit', { name: labels[form.type] })
        : t('connections.newTitle', { type: labels[form.type] });
  else if (picking) {
    title = t('connections.pickTitle');
    description = t('connections.pickHint');
  } else if (selected) {
    title = confirmingRemoval
      ? t('connections.removeTitle', { name: selected.name })
      : selected.name;
    description = `${labels[selected.type] ?? selected.type} · ${hostOf(selected.url)}`;
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => !next && state.closeDialog()}
      title={title}
      description={description}
    >
      {discarding ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{t('connections.discardBody')}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="destructive" onClick={state.leaveForm}>
              {t('connections.discard')}
            </Button>
            <Button type="button" variant="outline" onClick={() => state.setDiscarding(false)}>
              {t('connections.keepEditing')}
            </Button>
          </div>
        </div>
      ) : form ? (
        <ConnectionForm
          form={form}
          editing={state.editing !== null}
          connectionId={state.editing}
          hasCa={Boolean(state.editingItem?.hasCa)}
          focusSecret={state.focusSecret}
          busy={state.busy}
          saveTesting={state.saveTesting}
          onChange={state.setForm}
          onUpdate={(update) => state.setForm((current) => (current ? update(current) : current))}
          onCaError={state.setMessage}
          onSubmit={(event) => void state.save(event)}
          onSaveAndTest={() => void state.save(undefined, true)}
          onCancel={state.cancelForm}
        />
      ) : picking ? (
        <ConnectionPicker
          counts={state.counts}
          onPick={(type) => state.startForm(newFormOf(type))}
        />
      ) : selected && confirmingRemoval ? (
        <RemoveConfirmation
          item={selected}
          busy={state.busy}
          onConfirm={() => void state.action(selected, 'delete')}
          onCancel={() => state.setConfirmingRemoval(false)}
        />
      ) : selected ? (
        <ConnectionDetail
          item={selected}
          widgetCount={widgetCount}
          busy={state.busy}
          testing={state.testing}
          data={state.result?.id === selected.id ? state.result : null}
          onEdit={(fromFailure) => state.edit(selected, fromFailure)}
          onTest={() => void state.action(selected, 'test')}
          onRefreshData={() => void state.action(selected, 'data')}
          onResources={() => {
            state.setResourcesOf(selected);
            state.select(null);
          }}
          onRemove={() => state.setConfirmingRemoval(true)}
        />
      ) : null}
      {state.message && form && (
        <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm font-medium">
          {state.message}
        </p>
      )}
    </ResponsiveDialog>
  );
}

function RemoveConfirmation({
  item,
  busy,
  onConfirm,
  onCancel,
}: {
  item: Connection;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {hasInventoryDomain(item.type, 'resources')
          ? t('resources.removeBody')
          : t('connections.removeBody')}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="destructive" disabled={busy} onClick={onConfirm}>
          {t('connections.removeConfirm')}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}
