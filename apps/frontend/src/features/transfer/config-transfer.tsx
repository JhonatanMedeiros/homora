import { toast } from 'sonner';
import { useState, type ChangeEvent } from 'react';
import { Download } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SectionTitle } from '@/components/section-title';
import { apiError, t } from '@/i18n';
import { useConfigTransferApi } from '@/hooks/use-config-transfer-api';
import { ImportPreview } from './import-preview';
import { FormSelect, FormSelectOption } from '@/components/form-select';
import { MAX_FILE_BYTES, SOURCES, type Preview, type Source } from './transfer-model';

const FROM_FILE = 'file';

/** Export and import of groups and cards, with mandatory preview before saving. */
export function ConfigTransfer({ onImported }: { onImported: () => void | Promise<void> }) {
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [keepPrivate, setKeepPrivate] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [fileKey, setFileKey] = useState(0);
  const [source, setSource] = useState<Source>('homora');
  const [target, setTarget] = useState(FROM_FILE);
  const { pages, preview: requestPreview, apply: requestApply } = useConfigTransferApi();

  function reset() {
    setContent('');
    setPreview(null);
    setKeepPrivate(false);
    setFileKey((key) => key + 1);
  }

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPreview(null);
    setMessage('');
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setMessage(t('transfer.tooLarge'));
      toast.warning(t('transfer.tooLarge'));
      event.target.value = '';
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      setMessage(t('transfer.readFailed'));
      toast.error(t('transfer.readFailed'));
      return;
    }
    setContent(text);
    await runPreview(text, source);
  }

  async function runPreview(text: string, from: Source) {
    setBusy(true);
    setMessage('');
    try {
      const response = await requestPreview(text, from);
      if (!response.ok) throw new Error();
      setPreview((await response.json()) as Preview);
    } catch {
      setPreview(null);
      setMessage(t('transfer.previewFailed'));
      toast.error(t('transfer.previewFailed'));
    } finally {
      setBusy(false);
    }
  }

  function changeSource(next: Source) {
    setSource(next);
    setKeepPrivate(false);
    if (content) void runPreview(content, next);
  }

  async function apply() {
    if (!preview) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await requestApply({
        content,
        source,
        keepPrivate: source === 'homora' && keepPrivate,
        ...(target !== FROM_FILE && { pageId: Number(target) }),
        expectedVersion: preview.version,
      });
      const body = (await response.json().catch(() => null)) as {
        created?: number;
        code?: string;
        error?: string;
      } | null;
      if (response.status === 409) {
        setMessage(t('transfer.stale'));
        toast.warning(t('transfer.stale'));
        setPreview(null);
        return;
      }
      if (!response.ok) throw new Error(apiError(body, t('transfer.applyFailed')));
      reset();
      toast.success(t('transfer.done', { count: body?.created ?? 0 }));
      await onImported();
    } catch (error) {
      const failure =
        error instanceof Error && error.message ? error.message : t('transfer.applyFailed');
      setMessage(failure);
      toast.error(failure);
    } finally {
      setBusy(false);
    }
  }

  const hasChanges = preview
    ? preview.plan.summary.newServices + preview.plan.summary.newGroups > 0
    : false;
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="export-title">
        <Card>
          <CardHeader>
            <SectionTitle id="export-title">{t('transfer.exportTitle')}</SectionTitle>
            <CardDescription>{t('transfer.exportHint')}</CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <a href="/api/config/export?format=yaml" download>
                <Download data-icon="inline-start" />
                {t('transfer.downloadYaml')}
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href="/api/config/export?format=json" download>
                <Download data-icon="inline-start" />
                {t('transfer.downloadJson')}
              </a>
            </Button>
          </CardFooter>
        </Card>
      </section>
      <section aria-labelledby="import-title">
        <Card>
          <CardHeader>
            <SectionTitle id="import-title">{t('transfer.importTitle')}</SectionTitle>
            <CardDescription>{t('transfer.importHint')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="import-source">{t('transfer.source')}</FieldLabel>
              <FormSelect
                id="import-source"
                aria-label={t('transfer.source')}
                value={source}
                disabled={busy}
                onChange={(event) => changeSource(event.target.value as Source)}
              >
                {SOURCES.map((item) => (
                  <FormSelectOption key={item} value={item}>
                    {t(`transfer.source.${item}` as const)}
                  </FormSelectOption>
                ))}
              </FormSelect>
              {source !== 'homora' && (
                <FieldDescription>{t(`transfer.sourceHint.${source}` as const)}</FieldDescription>
              )}
            </Field>
            <Field>
              <FieldLabel htmlFor="import-file">{t('transfer.file')}</FieldLabel>
              <Input
                key={fileKey}
                id="import-file"
                type="file"
                accept=".yaml,.yml,.json"
                disabled={busy}
                onChange={(event) => void choose(event)}
              />
            </Field>
            {preview && <ImportPreview plan={preview.plan} />}
            {preview && pages.length > 1 && (
              <Field>
                <FieldLabel htmlFor="import-page">{t('pages.importTarget')}</FieldLabel>
                <FormSelect
                  id="import-page"
                  aria-label={t('pages.importTarget')}
                  value={target}
                  disabled={busy}
                  onChange={(event) => setTarget(event.target.value)}
                >
                  <FormSelectOption value={FROM_FILE}>
                    {t('pages.importTargetFile')}
                  </FormSelectOption>
                  {pages.map((page) => (
                    <FormSelectOption key={page.id} value={String(page.id)}>
                      {page.name}
                    </FormSelectOption>
                  ))}
                </FormSelect>
              </Field>
            )}
            {preview && source === 'homora' && (
              <Field orientation="horizontal" className="items-start">
                <Checkbox
                  id="import-keep-private"
                  checked={keepPrivate}
                  onCheckedChange={(checked) => setKeepPrivate(checked === true)}
                />
                <div className="flex flex-col gap-1">
                  <FieldLabel htmlFor="import-keep-private">{t('transfer.keepPrivate')}</FieldLabel>
                  <FieldDescription>{t('transfer.keepPrivateHint')}</FieldDescription>
                </div>
              </Field>
            )}
            <div role="status" className="empty:hidden">
              {message && (
                <Alert>
                  <AlertDescription className="text-foreground">{message}</AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
          {preview && (
            <CardFooter className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" disabled={busy} onClick={reset}>
                {t('transfer.cancel')}
              </Button>
              <Button type="button" disabled={busy || !hasChanges} onClick={() => void apply()}>
                {hasChanges
                  ? `${t('transfer.apply')} (${preview.plan.summary.newServices})`
                  : t('transfer.nothingToImport')}
              </Button>
            </CardFooter>
          )}
        </Card>
      </section>
    </div>
  );
}
