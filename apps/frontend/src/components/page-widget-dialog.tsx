import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@homora/ui/button';
import { Input } from '@homora/ui/input';
import { Field, FieldGroup, FieldLabel } from '@homora/ui/field';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@homora/ui/collapsible';
import { FormSelect, FormSelectOption } from '@/components/form-select';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { WidgetHost } from '@/components/widget-host';
import { getWidgetUI, listWidgetUI } from '@/components/widget-ui-registry';
import type { Connection } from '@/features/connections/connection-model';
import type { PageRow } from '@/hooks/use-pages';
import { t, tOr } from '@/i18n';
import { resolveWidget } from '@homora/integrations';
import type { WidgetSize } from '@homora/widgets';

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
  busy,
  error,
  onChange,
  onChoose,
  onSubmit,
  onClose,
}: Props) {
  const [query, setQuery] = useState('');
  const gallery = draft !== null && draft.id === null && !chosen;
  const pageName = pages.find((page) => page.id === draft?.pageId)?.name ?? '';
  const needle = query.trim().toLowerCase();
  const localOptions = listWidgetUI().filter(
    ([, entry]) => !needle || tOr(entry.name, entry.name).toLowerCase().includes(needle),
  );
  const shown = connections.filter(
    (connection) =>
      !needle ||
      connection.name.toLowerCase().includes(needle) ||
      connection.type.toLowerCase().includes(needle),
  );
  const entry = draft ? getWidgetUI(draft.type) : undefined;
  const sizes = (draft && resolveWidget(draft.type)?.sizes) || ['normal'];
  const Editor = entry?.Editor;
  const Preview = entry?.Preview;
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
        if (!open) {
          setQuery('');
          onClose();
        }
      }}
      wide
      title={gallery ? t('pageWidgets.add') : draft?.id ? t('pageWidgets.edit') : kindName}
      description={
        gallery
          ? t('pageWidgets.pick', { page: pageName })
          : draft?.id
            ? kindName
            : t('pageWidgets.willAdd', { page: pageName })
      }
    >
      {draft && gallery && (
        <div className="flex flex-col gap-4">
          <Input
            type="search"
            aria-label={t('pageWidgets.search')}
            placeholder={t('pageWidgets.search')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {localOptions.length > 0 && (
            <section aria-labelledby="pw-group-homora" className="flex flex-col gap-2">
              <h3
                id="pw-group-homora"
                className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
              >
                {t('pageWidgets.groupHomora')}
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {localOptions.map(([type, option]) => {
                  const Gallery = option.Gallery;
                  return (
                    <GalleryOption
                      key={type}
                      title={tOr(option.name, option.name)}
                      description={tOr(option.description, option.description)}
                      onPick={() => pick(null, type)}
                    >
                      <Gallery />
                    </GalleryOption>
                  );
                })}
              </div>
            </section>
          )}
          {shown.length > 0 && (
            <section aria-labelledby="pw-group-connections" className="flex flex-col gap-2">
              <h3
                id="pw-group-connections"
                className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
              >
                {t('pageWidgets.groupConnections')}
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {shown.map((connection) => (
                  <GalleryOption
                    key={connection.id}
                    title={connection.name}
                    description={t('pageWidgets.connectionDesc')}
                    onPick={() => pick(connection, connection.type)}
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      {connection.type}
                    </span>
                  </GalleryOption>
                ))}
              </div>
            </section>
          )}
          {localOptions.length === 0 && shown.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('pageWidgets.noMatch')}</p>
          )}
        </div>
      )}
      {draft && !gallery && (
        <form
          className="flex flex-col gap-4"
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
          <div className={Preview ? 'grid gap-4 md:grid-cols-[1fr_16rem]' : 'flex flex-col gap-4'}>
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
            {Preview && <Preview config={draft.config} name={draft.name} />}
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
                disabled={busy || (entry?.canSubmit ? !entry.canSubmit(draft.config) : false)}
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

function GalleryOption({
  title,
  description,
  onPick,
  children,
}: {
  title: string;
  description: string;
  onPick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex min-w-0 flex-col items-start gap-2 rounded-md border bg-card p-3 text-left transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="rounded bg-muted/60 px-2 py-1">{children}</span>
      <span className="text-sm font-medium">{title}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </button>
  );
}
