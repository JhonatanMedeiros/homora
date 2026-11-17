import { Plus, RotateCw } from 'lucide-react';
import { Button } from '@homora/ui/button';
import { Card } from '@homora/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@homora/ui/empty';
import { CardGridSkeleton } from '@/components/skeletons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@homora/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@homora/ui/tabs';
import { ConnectionCard } from './connection-card';
import { ConnectionDialog } from './connection-dialog';
import { ConnectionsSummary } from './connections-summary';
import type { ConnectionFormState } from './connection-model';
import { WidgetDialog } from './widget-dialog';
import { WidgetsSection } from './widgets-section';
import { ResourceInventoryPanel } from './resource-inventory';
import { t } from '@/i18n';
import { useConnectionsPage } from './use-connections-page';

export function Connections({ initialDraft }: { initialDraft?: ConnectionFormState | null } = {}) {
  const state = useConnectionsPage(initialDraft);
  const { items, widgets, tab, setTab, removingWidget, setRemovingWidget } = state;
  return (
    <section aria-label={t('connections.title')} className="flex flex-col gap-4">
      {items && <ConnectionsSummary items={items} widgets={widgets} />}
      <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
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
            <Button type="button" onClick={state.startAdding}>
              <Plus data-icon="inline-start" />
              {t('connections.add')}
            </Button>
          )}
        </div>
        <TabsContent value="connections" className="flex flex-col gap-4">
          {items === null && state.loadFailed ? (
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              onClick={() => {
                state.setLoadFailed(false);
                state.setMessage('');
                void state.load().catch(() => {
                  state.setLoadFailed(true);
                  state.setMessage(t('connections.loadFailed'));
                });
              }}
            >
              <RotateCw data-icon="inline-start" />
              {t('connections.retryLoad')}
            </Button>
          ) : items === null ? (
            <CardGridSkeleton label={t('connections.loading')} />
          ) : items.length === 0 ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyTitle className="font-label text-lg">{t('connections.empty')}</EmptyTitle>
                <EmptyDescription>{t('connections.emptyHint')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => (
                <li key={item.id} className="flex min-w-0">
                  <ConnectionCard item={item} onOpen={state.select} />
                </li>
              ))}
              <li className="flex min-w-0">
                <Card className="relative w-full items-center justify-center gap-1 border-dashed bg-transparent p-4 text-center transition-colors hover:border-ring">
                  <Button
                    type="button"
                    variant="link"
                    onClick={state.startAdding}
                    className="h-auto p-0 text-base font-semibold text-foreground after:absolute after:inset-0 after:content-[''] hover:no-underline"
                  >
                    <Plus data-icon="inline-start" />
                    {t('connections.add')}
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {t('connections.addCardHint')}
                  </span>
                </Card>
              </li>
            </ul>
          )}
        </TabsContent>
        <TabsContent value="widgets">
          <WidgetsSection
            items={items}
            widgets={widgets}
            busy={state.busy}
            cards={state.cards}
            widgetResult={state.widgetResult}
            onNew={state.newWidget}
            onEdit={state.editWidget}
            onQuery={(widget) => void state.queryWidget(widget)}
            onRemove={setRemovingWidget}
          />
        </TabsContent>
      </Tabs>
      {state.message && !state.form && (
        <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm font-medium">
          {state.message}
        </p>
      )}
      <ConnectionDialog state={state} />
      <WidgetDialog
        form={state.widgetForm}
        items={items ?? []}
        cards={state.cards}
        busy={state.busy}
        onChange={state.setWidgetForm}
        onSubmit={(event) => void state.saveWidget(event)}
        onClose={() => state.setWidgetForm(null)}
      />
      <ResourceInventoryPanel
        connection={state.resourcesOf}
        onClose={() => state.setResourcesOf(null)}
      />
      <AlertDialog
        open={removingWidget !== null}
        onOpenChange={(open) => !open && setRemovingWidget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('widgets.removeTitle', { name: removingWidget?.name ?? '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('widgets.removeBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const target = removingWidget;
                setRemovingWidget(null);
                if (target) void state.removeWidget(target);
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
