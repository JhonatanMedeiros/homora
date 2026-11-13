import { useState } from 'react';
import { toast } from 'sonner';
import { CUSTOM_CSS_MAX_BYTES, customCssProblem } from '@homora/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/form-error';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useCustomCss } from '@/hooks/use-custom-css';
import { useIsMobile } from '@/hooks/use-mobile';
import { t, type MessageKey } from '@/i18n';
import { SettingRow, SettingsGroup } from './setting-row';

/** The instance stylesheet: on/off, the text, and the rules it has to follow. */
export function CustomCssSettings() {
  const { css: saved, enabled, failed, safe, saveCss, setEnabled } = useCustomCss();
  const phone = useIsMobile();
  const [lastSaved, setLastSaved] = useState(saved);
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState<'save' | 'switch' | 'reset' | null>(null);
  const [error, setError] = useState('');
  // The stored text arrived or changed: start the draft from it.
  if (saved !== lastSaved) {
    setLastSaved(saved);
    setDraft(saved);
  }
  const problem = customCssProblem(draft);
  const dirty = draft !== saved;
  const size = new TextEncoder().encode(draft).length;
  const status = problem
    ? t('css.status.invalid')
    : dirty
      ? t('css.status.unsaved')
      : t('css.status.saved');

  const run = async (
    kind: 'save' | 'switch' | 'reset',
    action: () => Promise<{ ok: boolean; message?: string }>,
    done?: string,
  ) => {
    setBusy(kind);
    setError('');
    const result = await action();
    setBusy(null);
    if (result.ok) {
      if (done) toast.success(done);
    } else {
      const message = result.message || t('css.error');
      setError(message);
      toast.error(message);
    }
  };

  return (
    <SettingsGroup id="ui-css" title={t('css.title')}>
      <div className="flex flex-col gap-2 p-4 text-sm text-muted-foreground">
        <p>{t('css.intro')}</p>
        <p className="font-mono text-xs">{t('css.hooks')}</p>
      </div>
      {failed && (
        <div className="p-4">
          <Alert variant="destructive">
            <AlertDescription>{t('css.loadFailed')}</AlertDescription>
          </Alert>
        </div>
      )}
      <SettingRow
        htmlFor="css-enabled"
        label={t('css.enable')}
        description={safe ? t('css.safe.title') : t('css.enableHint')}
      >
        <Switch
          id="css-enabled"
          checked={enabled}
          disabled={busy !== null || (!enabled && saved.trim() === '')}
          onCheckedChange={(next) =>
            void run('switch', () => setEnabled(next), next ? undefined : t('css.turnedOff'))
          }
        />
      </SettingRow>
      <div className="flex flex-col gap-2 p-4">
        {phone && <p className="text-sm text-muted-foreground">{t('css.phone')}</p>}
        <label htmlFor="css-text" className="text-sm font-medium">
          {t('css.editor')}
        </label>
        <Textarea
          id="css-text"
          className="min-h-40 font-mono text-sm"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          placeholder={t('css.placeholder')}
          value={draft}
          readOnly={phone}
          aria-invalid={problem ? true : undefined}
          aria-describedby="css-text-problem css-text-counter"
          onChange={(event) => {
            setError('');
            setDraft(event.target.value);
          }}
        />
        <p id="css-text-counter" className="font-mono text-xs text-muted-foreground">
          {t('css.counter', { bytes: size, max: CUSTOM_CSS_MAX_BYTES })}
        </p>
        <FormError id="css-text-problem">
          {problem ? t(`css.problem.${problem}` as MessageKey) : ''}
        </FormError>
        <FormError>{error}</FormError>
      </div>
      {!phone && (
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p role="status" className="text-sm">
            {status}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="pointer-coarse:h-11"
              disabled={busy !== null || !enabled}
              onClick={() => void run('reset', () => setEnabled(false), t('css.turnedOff'))}
            >
              {busy === 'reset' && <Spinner data-icon="inline-start" />}
              {t('css.reset')}
            </Button>
            <Button
              type="button"
              className="pointer-coarse:h-11"
              disabled={busy !== null || !dirty || problem !== null}
              onClick={() => void run('save', () => saveCss(draft), t('css.saved'))}
            >
              {busy === 'save' && <Spinner data-icon="inline-start" />}
              {t('css.save')}
            </Button>
          </div>
        </div>
      )}
    </SettingsGroup>
  );
}
