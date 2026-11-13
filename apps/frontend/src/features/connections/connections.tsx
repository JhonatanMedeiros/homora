import { Plus, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { RowListSkeleton } from '@/components/skeletons';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConnectionForm } from './connection-form';
import { ConnectionList } from './connection-list';
import { ConnectionPicker } from './connection-picker';
import { newForm, type ConnectionFormState } from './connection-model';
import { WidgetsSection } from './widgets-section';
import { CoolifyResources } from './coolify-resources';
import { t } from '@/i18n';
import { useConnectionsPage } from '@/hooks/use-connections-page';

export function Connections({ initialDraft }: { initialDraft?: ConnectionFormState | null } = {}) {
  const state = useConnectionsPage(initialDraft);
  const {
    items,
    loadFailed,
    setLoadFailed,
    widgets,
    widgetName,
    setWidgetName,
    setWidgetConnection,
    widgetCard,
    setWidgetCard,
    editingWidget,
    setEditingWidget,
    widgetEditName,
    setWidgetEditName,
    widgetEditCard,
    setWidgetEditCard,
    cards,
    widgetResult,
    form,
    setForm,
    editing,
    editingItem,
    setEditing,
    message,
    setMessage,
    tab,
    setTab,
    picking,
    setPicking,
    resourcesOf,
    setResourcesOf,
    removing,
    setRemoving,
    result,
    busy,
    saveTesting,
    selectedConnection,
    counts,
    browsing,
    load,
    edit,
    createWidget,
    updateWidget,
    removeWidget,
    queryWidget,
    save,
    action,
  } = state;
  return (
    <section aria-label={t('connections.title')} className="flex flex-col gap-4">
      <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
        {(tab === 'widgets' || browsing) && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList variant="line">
              <TabsTrigger value="connections">
                {t('connections.tab')}
                {items && <span className="font-mono text-xs opacity-70">{items.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="widgets">
                {t('widgets.tab')}
                <span className="font-mono text-xs opacity-70">{widgets.length}</span>
              </TabsTrigger>
            </TabsList>
            {tab === 'connections' && items !== null && (
              <Button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setMessage('');
                  setPicking(true);
                }}
              >
                <Plus data-icon="inline-start" />
                {t('connections.add')}
              </Button>
            )}
          </div>
        )}
        <TabsContent value="connections" className="flex flex-col gap-4">
          {picking ? (
            <ConnectionPicker
              counts={counts}
              onPick={(type) => {
                setPicking(false);
                setForm(newForm(type));
              }}
              onCancel={() => setPicking(false)}
            />
          ) : form ? (
            <ConnectionForm
              form={form}
              editing={editing !== null}
              connectionId={editing}
              hasCa={Boolean(editingItem?.hasCa)}
              busy={busy}
              saveTesting={saveTesting}
              onChange={setForm}
              onUpdate={(update) => setForm((current) => (current ? update(current) : current))}
              onCaError={setMessage}
              onSubmit={(event) => void save(event)}
              onSaveAndTest={() => void save(undefined, true)}
              onCancel={() => {
                setForm(null);
                setEditing(null);
                setMessage('');
              }}
            />
          ) : items === null && loadFailed ? (
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              onClick={() => {
                setLoadFailed(false);
                setMessage('');
                void load().catch(() => {
                  setLoadFailed(true);
                  setMessage(t('connections.loadFailed'));
                });
              }}
            >
              <RotateCw data-icon="inline-start" />
              {t('connections.retryLoad')}
            </Button>
          ) : items === null ? (
            <RowListSkeleton label={t('connections.loading')} />
          ) : items.length === 0 ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyTitle className="font-label text-lg">{t('connections.empty')}</EmptyTitle>
                <EmptyDescription>{t('connections.emptyHint')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ConnectionList
              items={items}
              busy={busy}
              result={result}
              onEdit={edit}
              onAction={(item, operation) => void action(item, operation)}
              onResources={setResourcesOf}
              onRemove={(item) => setRemoving({ kind: 'connection', item })}
            />
          )}
        </TabsContent>
        <TabsContent value="widgets">
          <WidgetsSection
            items={items}
            widgets={widgets}
            busy={busy}
            widgetName={widgetName}
            widgetConnection={selectedConnection}
            cards={cards}
            widgetCard={widgetCard}
            editingWidget={editingWidget}
            widgetEditName={widgetEditName}
            onEdit={(widget) => {
              setEditingWidget(widget.id);
              setWidgetEditName(widget.name);
              setWidgetEditCard(widget.serviceId ? String(widget.serviceId) : '');
            }}
            onEditNameChange={setWidgetEditName}
            widgetEditCard={widgetEditCard}
            onEditCardChange={setWidgetEditCard}
            onCancelEdit={() => setEditingWidget(null)}
            onSaveEdit={(widget, name, card) => void updateWidget(widget, name, card)}
            onCardChange={setWidgetCard}
            widgetResult={widgetResult}
            onNameChange={setWidgetName}
            onConnectionChange={setWidgetConnection}
            onCreate={(event) => void createWidget(event)}
            onQuery={(widget) => void queryWidget(widget)}
            onRemove={(widget) => setRemoving({ kind: 'widget', item: widget })}
          />
        </TabsContent>
      </Tabs>
      {message && (
        <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm font-medium">
          {message}
        </p>
      )}
      <CoolifyResources connection={resourcesOf} onClose={() => setResourcesOf(null)} />
      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {removing?.kind === 'widget'
                ? t('widgets.removeTitle', { name: removing.item.name })
                : t('connections.removeTitle', { name: removing?.item.name ?? '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.kind === 'widget'
                ? t('widgets.removeBody')
                : removing?.item.type === 'coolify'
                  ? t('coolify.removeBody')
                  : t('connections.removeBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const target = removing;
                setRemoving(null);
                if (target?.kind === 'widget') void removeWidget(target.item);
                else if (target) void action(target.item, 'delete');
              }}
            >
              {t('common.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
