import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { DEFAULT_APPEARANCE, IMAGE_MAX_BYTES, type ContrastProblem } from '@homora/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/form-error';
import { Spinner } from '@/components/ui/spinner';
import { useAppearance } from '@/hooks/use-appearance';
import { useAppearanceDraft } from '@/hooks/use-appearance-draft';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTheme } from '@/hooks/use-theme';
import { t, type MessageKey } from '@/i18n';
import { previewStyle, sameAppearance } from '@/lib/appearance';
import { apiError } from '@/i18n/api-errors';
import { SettingsGroup } from './setting-row';
import { AppearanceAdvancedSettings } from './appearance-advanced-settings';
import { AppearanceColors } from './appearance-colors';

/** One decimal, rounded down, so a failing ratio never reads as exactly the minimum. */
const ratioText = (value: number) => (Math.floor(value * 10) / 10).toFixed(1);

function problemText(problem: ContrastProblem) {
  return t(`appearance.problem.${problem.code}` as MessageKey, {
    ratio: ratioText(problem.ratio),
    required: String(problem.required),
    surface: t(`appearance.surface.${problem.on}` as MessageKey),
    theme: t(`appearance.theme.${problem.theme}` as MessageKey),
  });
}

/** Accent, page background and card translucency, saved on the server for every device. */
export function AppearanceSettings() {
  const { appearance: saved, failed, save, reset, uploadImage, removeImage } = useAppearance();
  const phone = useIsMobile();
  const { theme } = useTheme();
  const editor = useAppearanceDraft(saved);
  const {
    draft,
    setDraft,
    hexText,
    setHexText,
    hexValid,
    candidate,
    problems,
    dirty,
    blocked,
    error,
    setError,
    patch,
    discard,
  } = editor;
  const [busy, setBusy] = useState<'save' | 'reset' | 'image' | null>(null);
  const status = busy
    ? t('appearance.status.saving')
    : blocked
      ? t('appearance.status.blocked')
      : dirty
        ? t('appearance.status.unsaved')
        : t('appearance.status.saved');

  const submit = async () => {
    if (!candidate || blocked) return;
    setBusy('save');
    setError('');
    const result = await save(candidate);
    setBusy(null);
    if (!result.ok) {
      const message = result.message || t('appearance.error');
      setError(message);
      toast.error(message);
    } else toast.success(t('appearance.status.saved'));
  };
  const send = async (file: File) => {
    if (file.size > IMAGE_MAX_BYTES) {
      setError(apiError({ code: 'image-too-large' }, t('appearance.error')));
      return;
    }
    setBusy('image');
    setError('');
    const result = await uploadImage(file);
    setBusy(null);
    if (result.ok) toast.success(t('appearance.imageSet'));
    else {
      const message = result.message || t('appearance.error');
      setError(message);
      toast.error(message);
    }
  };
  const dropImage = async () => {
    setBusy('image');
    setError('');
    const result = await removeImage();
    setBusy(null);
    if (result.ok) toast.success(t('appearance.imageRemoved'));
    else {
      const message = result.message || t('appearance.error');
      setError(message);
      toast.error(message);
    }
  };
  const restore = async () => {
    setBusy('reset');
    setError('');
    const result = await reset();
    setBusy(null);
    if (result.ok) toast.success(t('appearance.resetDone'));
    else {
      const message = result.message || t('appearance.error');
      setError(message);
      toast.error(message);
    }
  };

  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <SettingsGroup
          id="ui-appearance-server"
          title={t('appearance.title')}
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="pointer-coarse:h-11"
              disabled={busy !== null || (sameAppearance(saved, DEFAULT_APPEARANCE) && !dirty)}
              onClick={() => void restore()}
            >
              {busy === 'reset' && <Spinner data-icon="inline-start" />}
              {t('appearance.reset')}
            </Button>
          }
        >
          <p className="p-4 text-sm text-muted-foreground">{t('appearance.intro')}</p>
          {failed && (
            <div className="p-4">
              <Alert variant="destructive">
                <TriangleAlert aria-hidden="true" />
                <AlertDescription>{t('appearance.loadFailed')}</AlertDescription>
              </Alert>
            </div>
          )}

          <AppearanceColors
            draft={draft}
            hexText={hexText}
            hexValid={hexValid}
            theme={theme}
            onChange={patch}
            onHexChange={setHexText}
            onHexEdit={() => setError('')}
          />

          <AppearanceAdvancedSettings
            phone={phone}
            saved={saved}
            draft={draft}
            busy={busy !== null}
            imageBusy={busy === 'image'}
            onSend={(file) => void send(file)}
            onRemoveImage={() => void dropImage()}
            onChange={patch}
            onChangeImage={(change) =>
              setDraft((current) =>
                current.image ? { ...current, image: { ...current.image, ...change } } : current,
              )
            }
          />
          {problems.length > 0 && (
            <div className="p-4">
              <Alert variant="destructive">
                <TriangleAlert aria-hidden="true" />
                <AlertTitle>{t('appearance.contrastTitle')}</AlertTitle>
                <AlertDescription>
                  <ul className="flex list-disc flex-col gap-1 pl-4">
                    {problems.map((problem) => (
                      <li key={`${problem.code}-${problem.theme}-${problem.on}`}>
                        {problemText(problem)}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            </div>
          )}
          <FormError className="px-4 pt-4 empty:hidden">{error}</FormError>
        </SettingsGroup>
        {(dirty || busy !== null) && (
          <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-lg sm:flex-row sm:items-center sm:justify-between md:bottom-4">
            <p role="status" className="flex items-center gap-2 text-sm">
              {dirty && !busy && !blocked && (
                <Badge variant="secondary">{t('appearance.status.unsaved')}</Badge>
              )}
              {status}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="pointer-coarse:h-11"
                disabled={busy !== null}
                onClick={discard}
              >
                {t('appearance.discard')}
              </Button>
              <Button
                type="button"
                className="pointer-coarse:h-11"
                disabled={busy !== null || blocked || !dirty}
                onClick={() => void submit()}
              >
                {busy === 'save' && <Spinner data-icon="inline-start" />}
                {t('appearance.save')}
              </Button>
            </div>
          </div>
        )}
      </div>
      <aside className="order-first xl:sticky xl:top-6 xl:order-none xl:w-72 xl:shrink-0">
        <div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
          <span className="font-mono text-xs text-muted-foreground">{t('appearance.preview')}</span>
          <div
            data-testid="appearance-preview"
            className="rounded-lg border bg-background p-4 text-foreground"
            style={previewStyle(candidate ?? saved, theme)}
          >
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 text-card-foreground">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-medium">{t('appearance.previewCard')}</span>
                <span className="text-sm text-muted-foreground">
                  {t('appearance.previewCardText')}
                </span>
              </div>
              <Button size="sm" className="pointer-coarse:h-11">
                {t('appearance.previewAction')}
              </Button>
            </div>
            <p className="mt-3 text-sm text-accent-text">{t('appearance.accent')}</p>
            <p className="text-sm text-muted-foreground">{t('appearance.previewMuted')}</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
