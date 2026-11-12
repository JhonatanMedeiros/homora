import { Spinner } from '@/components/ui/spinner';
import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { CopyButton } from '@/components/copy-button';
import { SectionTitle } from '@/components/section-title';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupInput } from '@/components/ui/input-group';
import { Switch } from '@/components/ui/switch';
import { SettingRow, SettingsGroup } from '@/features/settings/setting-row';
import { PublicStatusView, type PublicStatus } from '@/pages/status-page';
import { t } from '@/i18n';

type Admin = { enabled: boolean; title: string; description: string; preview: PublicStatus };

/** Administrator controls for the public status page, with a preview of exactly what is exposed. */
export function PublicStatusSettings() {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const address = `${window.location.origin}/status`;

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/public-status/admin', { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<Admin>) : null))
      .then((data) => {
        if (data) {
          setAdmin(data);
          setTitle(data.title);
          setDescription(data.description ?? '');
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  async function update(patch: { enabled?: boolean; title?: string; description?: string }) {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/public-status/admin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error();
      const data = (await response.json()) as Admin;
      setAdmin(data);
      setTitle(data.title);
      setDescription(data.description ?? '');
      setMessage({ kind: 'ok', text: t('settings.public.saved') });
    } catch {
      setMessage({ kind: 'error', text: t('settings.public.error') });
    } finally {
      setSaving(false);
    }
  }

  if (!admin) return null;
  const shared = admin.preview.services.length;
  const dirty = title !== admin.title || description !== (admin.description ?? '');
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="public-status-title" className="flex flex-col gap-3">
        <SectionTitle
          id="public-status-title"
          actions={
            <Badge variant={admin.enabled ? 'success' : 'secondary'}>
              {admin.enabled ? t('settings.public.status.on') : t('settings.public.status.off')}
            </Badge>
          }
        >
          {t('settings.public.title')}
        </SectionTitle>
        <p className="max-w-[65ch] text-sm text-muted-foreground">{t('settings.public.hint')}</p>
      </section>

      <SettingsGroup id="public-page" title={t('settings.public.pageTitle')}>
        <SettingRow
          htmlFor="public-status-enabled"
          label={t('settings.public.enable')}
          description={t('settings.public.enableHint')}
        >
          <Switch
            id="public-status-enabled"
            checked={admin.enabled}
            disabled={saving}
            onCheckedChange={(checked) => void update({ enabled: checked })}
          />
        </SettingRow>
        <div className="flex flex-col gap-2 p-4">
          <label htmlFor="public-status-address" className="text-sm font-medium">
            {t('settings.public.address')}
          </label>
          <div className="flex flex-wrap gap-2">
            <InputGroup className="min-w-60 flex-1">
              <InputGroupInput
                id="public-status-address"
                readOnly
                value={address}
                className="font-mono"
                onFocus={(event) => event.currentTarget.select()}
              />
            </InputGroup>
            <CopyButton
              text={address}
              label={t('settings.public.copy')}
              doneLabel={t('settings.public.copied')}
              onFailed={() => setMessage({ kind: 'error', text: t('settings.public.copyFailed') })}
            />
            <Button asChild variant="outline">
              <a href={address} target="_blank" rel="noopener noreferrer">
                <ExternalLink data-icon="inline-start" />
                {t('settings.public.open')}
              </a>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {admin.enabled ? t('settings.public.addressHint') : t('settings.public.addressOff')}
          </p>
        </div>
      </SettingsGroup>

      <SettingsGroup id="public-content" title={t('settings.public.contentTitle')}>
        <form
          className="flex flex-col gap-4 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void update({ title, description });
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="public-status-name">
                {t('settings.public.titleLabel')}
              </FieldLabel>
              <Input
                id="public-status-name"
                value={title}
                maxLength={60}
                placeholder={t('settings.public.titlePlaceholder')}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="public-status-description">
                {t('settings.public.descriptionLabel')}
              </FieldLabel>
              <Input
                id="public-status-description"
                value={description}
                maxLength={160}
                placeholder={t('settings.public.descriptionPlaceholder')}
                onChange={(event) => setDescription(event.target.value)}
              />
              <FieldDescription>{t('settings.public.descriptionHint')}</FieldDescription>
            </Field>
          </FieldGroup>
          <div>
            <Button type="submit" variant="secondary" disabled={saving || !dirty}>
              {saving && <Spinner data-icon="inline-start" />}
              {t('settings.public.save')}
            </Button>
          </div>
        </form>
        <div className="flex flex-col gap-1 p-4">
          <p className="text-sm font-medium">{t('settings.public.shared', { count: shared })}</p>
          <p className="text-sm text-muted-foreground">{t('settings.public.sharedHint')}</p>
        </div>
      </SettingsGroup>

      <Alert>
        <AlertDescription>{t('settings.public.notice')}</AlertDescription>
      </Alert>

      <section aria-labelledby="public-preview" className="flex flex-col gap-3">
        <SectionTitle id="public-preview">{t('settings.public.previewTitle')}</SectionTitle>
        <p className="text-sm text-muted-foreground">{t('settings.public.previewHint')}</p>
        <div className="rounded-lg border p-4">
          {shared ? (
            <PublicStatusView data={admin.preview} />
          ) : (
            <p className="text-sm">{t('settings.public.previewEmpty')}</p>
          )}
        </div>
      </section>

      <div role="status" className="empty:hidden">
        {message && (
          <Alert variant={message.kind === 'error' ? 'destructive' : 'default'}>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
