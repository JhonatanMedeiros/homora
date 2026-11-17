import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@homora/ui/alert';
import { Button } from '@homora/ui/button';
import { Field, FieldDescription, FieldLabel } from '@homora/ui/field';
import { Input } from '@homora/ui/input';
import { Skeleton } from '@homora/ui/skeleton';
import { Spinner } from '@homora/ui/spinner';
import { LoadingRegion } from '@/components/skeletons';
import { t } from '@/i18n';
import { SettingsGroup } from './setting-row';

type Trust = {
  certificates: { subject: string; validFrom: string; validTo: string }[];
  invalid: boolean;
};

export function MonitoringTrustSettings() {
  const [trust, setTrust] = useState<Trust | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileVersion, setFileVersion] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/monitoring/trust', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        setTrust((await response.json()) as Trust);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(t('settings.trust.loadError'));
      });
    return () => controller.abort();
  }, []);
  async function change(remove: boolean) {
    setError('');
    setBusy(remove ? 'remove' : 'upload');
    try {
      if (!remove && (!file || file.size > 65_536)) throw new Error();
      const response = await fetch(
        '/api/monitoring/trust',
        remove
          ? { method: 'DELETE' }
          : {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ bundle: await file?.text() }),
            },
      );
      if (!response.ok) throw new Error();
      setTrust((await response.json()) as Trust);
      setFile(null);
      setFileVersion((version) => version + 1);
      toast.success(t('settings.trust.saved'));
    } catch {
      setError(t('settings.trust.saveError'));
      toast.error(t('settings.trust.saveError'));
    } finally {
      setBusy(null);
    }
  }
  return (
    <SettingsGroup id="monitoring-trust" title={t('settings.trust.title')}>
      <div className="flex flex-col gap-4 p-4">
        <p className="text-sm text-muted-foreground">{t('settings.trust.hint')}</p>
        {!trust && !error && (
          <LoadingRegion label={t('settings.trust.loading')} className="flex flex-col gap-3">
            <Skeleton className="h-4 w-2/3 motion-reduce:animate-none" />
            <Skeleton className="h-10 w-full motion-reduce:animate-none" />
          </LoadingRegion>
        )}
        {(error || trust?.invalid) && (
          <Alert variant="destructive">
            <AlertDescription>{error || t('settings.trust.invalid')}</AlertDescription>
          </Alert>
        )}
        {trust?.certificates?.map((certificate, index) => (
          <div key={`${certificate.subject}-${index}`} className="text-sm">
            <p className="break-all">{certificate.subject}</p>
            <p className="text-muted-foreground">
              {t('settings.trust.validity', {
                from: new Date(certificate.validFrom).toLocaleDateString(),
                to: new Date(certificate.validTo).toLocaleDateString(),
              })}
            </p>
          </div>
        ))}
        {(trust || error) && (
          <>
            <Field>
              <FieldLabel htmlFor="monitoring-ca-file">{t('settings.trust.file')}</FieldLabel>
              <Input
                key={fileVersion}
                id="monitoring-ca-file"
                type="file"
                accept=".pem,.crt"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <FieldDescription>{t('settings.trust.fileHint')}</FieldDescription>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button disabled={!file || Boolean(busy)} onClick={() => void change(false)}>
                {busy === 'upload' && <Spinner data-icon="inline-start" />}
                {t('settings.trust.upload')}
              </Button>
              <Button
                variant="outline"
                disabled={
                  Boolean(busy) ||
                  !trust ||
                  (!trust.invalid && (trust.certificates?.length ?? 0) === 0)
                }
                onClick={() => void change(true)}
              >
                {busy === 'remove' && <Spinner data-icon="inline-start" />}
                {t('settings.trust.remove')}
              </Button>
            </div>
          </>
        )}
      </div>
    </SettingsGroup>
  );
}
