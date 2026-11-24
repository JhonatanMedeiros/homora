import { ArrowLeft } from 'lucide-react';
import { Button } from '@homora/ui/button';
import { Input } from '@homora/ui/input';
import { Field, FieldGroup, FieldLabel } from '@homora/ui/field';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@homora/ui/collapsible';
import { FormSelect, FormSelectOption } from '@/components/form-select';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { WidgetErrorBoundary } from '@/components/widget-error-boundary';
import { WidgetGallery } from '@/components/widget-gallery';
import { WidgetHost } from '@/components/widget-host';
import { getWidgetUI } from '@/components/widget-ui-registry';
import type { Connection } from '@/features/connections/connection-model';
import { useWidgetMonitoring } from '@/hooks/use-widget-monitoring';
import type { PageRow } from '@/hooks/use-pages';
import { t, tOr } from '@/i18n';
import { integrationWidgetDefinition, resolveWidget } from '@homora/integrations';
import { supportsSource } from '@homora/widgets';
import type { WidgetSize } from '@homora/widgets';
import type { WidgetUI } from '@homora/widgets/ui';

export type WidgetDraft = {
  id: number | null;
  pageId: number;
  type: string;
  name: string;
  config: unknown;
  connectionId: number | null;
  size: WidgetSize;
};

type Props = {
  /** `null` closes the dialog. A new widget without a `chosen` kind starts on the gallery. */
  draft: WidgetDraft | null;
  chosen: boolean;
  connections: Connection[];
  pages: PageRow[];
  groups?: { name: string; pageId: number | null }[];
  busy: boolean;
  error: string;
  onChange: (draft: WidgetDraft) => void;
  onChoose: (chosen: boolean) => void;
  onSubmit: () => void;
  onClose: () => void;
};

/** Add flow: a searchable gallery first, then the options with a live preview. Editing skips the gallery. */
function DialogContents({
  draft,
  chosen,
  connections,
  pages,
  groups,
  busy,
  error,
  onChange,
  onChoose,
  onSubmit,
  onClose,
}: Props) {
  const gallery = draft !== null && draft.id === null && !chosen;
  const pageName = pages.find((page) => page.id === draft?.pageId)?.name ?? '';
  const entry = draft ? getWidgetUI(draft.type) : undefined;
  const sizes = (draft && resolveWidget(draft.type)?.sizes) || ['normal'];
  const definition = draft && resolveWidget(draft.type);
  const connectedModule = Boolean(entry && definition?.source?.contract.startsWith('integration:'));
  const compatibleConnections = connectedModule
    ? connections.filter((connection) =>
        supportsSource(
          definition!.source,
          integrationWidgetDefinition(connection.type)?.source ?? null,
        ),
      )
    : [];
  const Editor = entry?.Editor;
  const Preview = entry?.Preview;
  const parsedConfig = !gallery && draft && entry ? entry.parse(draft.config) : null;
  const monitoring = useWidgetMonitoring(
    !Preview && parsedConfig != null && entry?.monitoringQuery
      ? entry.monitoringQuery(parsedConfig)
      : null,
  );
  const hasPreview = Boolean(Preview || entry?.View);
  const kindName =
    draft?.connectionId == null
      ? entry
        ? tOr(entry.name, entry.name)
        : (draft?.type ?? '')
      : (connections.find((connection) => connection.id === draft.connectionId)?.name ??
        draft.type);
  const pick = (connection: Connection | null, type: string) => {
    if (!draft) return;
    onChange({
      ...draft,
      type: connection?.type ?? type,
      config: connection ? {} : (getWidgetUI(type)?.defaultConfig ?? {}),
      connectionId: connection?.id ?? null,
      size: 'normal',
    });
    onChoose(true);
  };
  return (
    <ResponsiveDialog
      open={draft !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="gallery"
      title={gallery ? t('pageWidgets.add') : draft?.id ? t('pageWidgets.edit') : kindName}
      description={
        gallery
          ? t('pageWidgets.pick', { page: pageName })
          : draft?.id
            ? kindName
            : t('pageWidgets.willAdd', { page: pageName })
      }
    >
      {draft && gallery && <WidgetGallery connections={connections} onPick={pick} />}
      {draft && !gallery && (
        <form
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div
            className={
              hasPreview
                ? draft.size === 'wide'
                  ? 'grid gap-4 md:grid-cols-[1fr_24rem]'
                  : 'grid gap-4 md:grid-cols-[1fr_18rem]'
                : 'flex flex-col gap-4'
            }
          >
            <FieldGroup>
              {sizes.length > 1 && (
                <Field>
                  <FieldLabel htmlFor="pw-size">{t('pageWidgets.size')}</FieldLabel>
                  <FormSelect
                    id="pw-size"
                    value={draft.size}
                    onChange={(event) =>
                      onChange({ ...draft, size: event.target.value as WidgetSize })
                    }
                  >
                    {sizes.map((size) => (
                      <FormSelectOption key={size} value={size}>
                        {t(size === 'wide' ? 'pageWidgets.sizeWide' : 'pageWidgets.sizeNormal')}
                      </FormSelectOption>
                    ))}
                  </FormSelect>
                </Field>
              )}
              {connectedModule && (
                <Field>
                  <FieldLabel htmlFor="pw-connection">
                    {t('pageWidgets.groupConnections')}
                  </FieldLabel>
                  <FormSelect
                    id="pw-connection"
                    value={String(draft.connectionId ?? '')}
                    onChange={(event) =>
                      onChange({
                        ...draft,
                        connectionId: event.target.value ? Number(event.target.value) : null,
                      })
                    }
                  >
                    <FormSelectOption value="">—</FormSelectOption>
                    {compatibleConnections.map((connection) => (
                      <FormSelectOption key={connection.id} value={String(connection.id)}>
                        {connection.name}
                      </FormSelectOption>
                    ))}
                  </FormSelect>
                </Field>
              )}
              {Editor && (
                <Editor
                  config={draft.config}
                  onChange={(config) => onChange({ ...draft, config })}
                />
              )}
              <Collapsible defaultOpen={draft.id !== null && draft.name !== ''}>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="-ml-2">
                    {t('pageWidgets.details')}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="pw-name">{t('pageWidgets.name')}</FieldLabel>
                      <Input
                        id="pw-name"
                        maxLength={80}
                        value={draft.name}
                        onChange={(event) => onChange({ ...draft, name: event.target.value })}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="pw-page">{t('pageWidgets.page')}</FieldLabel>
                      <FormSelect
                        id="pw-page"
                        value={String(draft.pageId)}
                        onChange={(event) =>
                          onChange({ ...draft, pageId: Number(event.target.value) })
                        }
                      >
                        {pages.map((page) => (
                          <FormSelectOption key={page.id} value={String(page.id)}>
                            {page.name}
                          </FormSelectOption>
                        ))}
                      </FormSelect>
                    </Field>
                  </FieldGroup>
                </CollapsibleContent>
              </Collapsible>
            </FieldGroup>
            {Preview ? (
              <Preview config={draft.config} name={draft.name} />
            ) : (
              entry?.View && (
                <GenericPreview
                  type={draft.type}
                  entry={entry}
                  parsedConfig={parsedConfig}
                  name={draft.name}
                  wide={draft.size === 'wide'}
                  groups={groups}
                  pages={pages}
                  monitoring={monitoring}
                />
              )
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {draft.id === null ? (
              <Button type="button" variant="ghost" onClick={() => onChoose(false)}>
                <ArrowLeft />
                {t('pageWidgets.back')}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                {t('pages.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={
                  busy ||
                  (connectedModule &&
                    !compatibleConnections.some(
                      (connection) => connection.id === draft.connectionId,
                    )) ||
                  (entry?.canSubmit ? !entry.canSubmit(draft.config) : false)
                }
              >
                {draft.id === null ? t('pageWidgets.add') : t('widgets.save')}
              </Button>
            </div>
          </div>
        </form>
      )}
    </ResponsiveDialog>
  );
}

export function PageWidgetDialog(props: Props) {
  return (
    <WidgetHost groups={props.groups} pages={props.pages}>
      <DialogContents {...props} />
    </WidgetHost>
  );
}

function GenericPreview({
  type,
  entry,
  parsedConfig,
  name,
  wide,
  groups,
  pages,
  monitoring,
}: {
  type: string;
  entry: WidgetUI;
  parsedConfig: unknown | null;
  name: string;
  wide: boolean;
  groups?: { name: string; pageId: number | null }[];
  pages: PageRow[];
  monitoring: ReturnType<typeof useWidgetMonitoring>;
}) {
  const View = entry.View;
  return (
    <aside
      aria-label={t('pageWidgets.preview')}
      className="flex flex-col gap-2 rounded-md bg-muted/50 p-3"
    >
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {t('pageWidgets.preview')}
      </span>
      <div className="flex min-w-0 flex-col gap-3 rounded-md border bg-card p-3">
        <span className="truncate text-sm font-medium">{name || tOr(entry.name, entry.name)}</span>
        {parsedConfig === null ? (
          <p className="text-xs text-muted-foreground">{t('pageWidgets.previewIncomplete')}</p>
        ) : (
          <WidgetErrorBoundary key={type}>
            <WidgetHost incidentReading={monitoring} wide={wide} groups={groups} pages={pages}>
              <View config={parsedConfig} />
            </WidgetHost>
          </WidgetErrorBoundary>
        )}
      </div>
      <span className="text-xs text-muted-foreground">{t('pageWidgets.previewHint')}</span>
    </aside>
  );
}
