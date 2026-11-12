import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PublicStatusView, type PublicStatus } from '@/pages/status-page';
import { t } from '@/i18n';

type Admin = { enabled: boolean; title: string; preview: PublicStatus };

/** Administrator controls for the public status page, with a preview of exactly what is exposed. */
export function PublicStatusSettings() {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/public-status/admin', { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<Admin>) : null))
      .then((data) => {
        if (data) {
          setAdmin(data);
          setTitle(data.title);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  async function update(patch: { enabled?: boolean; title?: string }) {
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
      setMessage({ kind: 'ok', text: t('settings.public.saved') });
    } catch {
      setMessage({ kind: 'error', text: t('settings.public.error') });
    } finally {
      setSaving(false);
    }
  }

  if (!admin) return null;
  return (
    <section aria-labelledby="public-status-title" className="flex flex-col gap-4">
      <div>
        <h2 id="public-status-title" className="text-xl">
          {t('settings.public.title')}
        </h2>
        <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">
          {t('settings.public.hint')}
        </p>
      </div>
      <Field orientation="horizontal" className="items-start">
        <Checkbox
          id="public-status-enabled"
          checked={admin.enabled}
          disabled={saving}
          onCheckedChange={(checked) => void update({ enabled: checked === true })}
        />
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="public-status-enabled">{t('settings.public.enable')}</FieldLabel>
          <FieldDescription>{t('settings.public.enableHint')}</FieldDescription>
        </div>
      </Field>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void update({ title });
        }}
      >
        <Field className="min-w-48 flex-1">
          <FieldLabel htmlFor="public-status-name">{t('settings.public.titleLabel')}</FieldLabel>
          <Input
            id="public-status-name"
            value={title}
            maxLength={60}
            placeholder={t('settings.public.titlePlaceholder')}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <Button type="submit" variant="secondary" disabled={saving || title === admin.title}>
          {t('settings.public.save')}
        </Button>
      </form>
      <Alert>
        <AlertDescription>{t('settings.public.notice')}</AlertDescription>
      </Alert>
      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <h3 className="font-medium">{t('settings.public.previewTitle')}</h3>
        <p className="text-sm text-muted-foreground">{t('settings.public.previewHint')}</p>
        {admin.preview.services.length ? (
          <PublicStatusView data={admin.preview} />
        ) : (
          <p className="text-sm">{t('settings.public.previewEmpty')}</p>
        )}
      </div>
      <div role="status" className="empty:hidden">
        {message && (
          <Alert variant={message.kind === 'error' ? 'destructive' : 'default'}>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}
      </div>
    </section>
  );
}
