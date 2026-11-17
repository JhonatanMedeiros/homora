import { ArrowLeft } from 'lucide-react';
import { Button } from '@homora/ui/button';
import { Input } from '@homora/ui/input';
import { Field, FieldGroup, FieldLabel } from '@homora/ui/field';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@homora/ui/collapsible';
import { FormSelect, FormSelectOption } from '@/components/form-select';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { WidgetGallery } from '@/components/widget-gallery';
import { WidgetHost } from '@/components/widget-host';
import { getWidgetUI } from '@/components/widget-ui-registry';
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
  const gallery = draft !== null && draft.id === null && !chosen;
  const pageName = pages.find((page) => page.id === draft?.pageId)?.name ?? '';
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
        if (!open) onClose();
      }}
      size={gallery ? 'gallery' : 'wide'}
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
