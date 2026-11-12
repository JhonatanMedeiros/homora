import { useRef, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import {
  ACCENT_IDS,
  ACCENT_PRESETS,
  BACKGROUND_IDS,
  BACKGROUND_PRESETS,
  CARD_OPACITY_MAX,
  CARD_OPACITY_MIN,
  CARD_OPACITY_STEP,
  DEFAULT_APPEARANCE,
  IMAGE_DIM_MAX,
  IMAGE_DIM_STEP,
  IMAGE_MAX_BYTES,
  IMAGE_POSITIONS,
  contrastProblems,
  isHexColor,
  type AccentId,
  type Appearance,
  type BackgroundId,
  type ContrastProblem,
  type ImagePosition,
  type ThemeName,
} from '@homora/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormSelect, FormSelectOption } from '@/components/form-select';
import { FormError } from '@/components/form-error';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useAppearance } from '@/hooks/use-appearance';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTheme } from '@/hooks/use-theme';
import { t, type MessageKey } from '@/i18n';
import { previewStyle } from '@/lib/appearance';
import { apiError } from '@/i18n/api-errors';
import { Segmented } from './segmented';
import { SettingRow, SettingsGroup } from './setting-row';

const OPACITIES = Array.from(
  { length: (CARD_OPACITY_MAX - CARD_OPACITY_MIN) / CARD_OPACITY_STEP + 1 },
  (_, index) => CARD_OPACITY_MIN + index * CARD_OPACITY_STEP,
);
const CUSTOM_FALLBACK = '#2f7d6b';

const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

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

const sameAppearance = (a: Appearance, b: Appearance) => JSON.stringify(a) === JSON.stringify(b);
const swatchBackground = (id: BackgroundId, theme: ThemeName) => {
  const stops = BACKGROUND_PRESETS[id]?.[theme];
  return stops ? `linear-gradient(160deg, ${stops.join(', ')})` : undefined;
};

/** Accent, page background and card translucency, saved on the server for every device. */
export function AppearanceSettings() {
  const { appearance: saved, failed, save, reset, uploadImage, removeImage } = useAppearance();
  const phone = useIsMobile();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { theme } = useTheme();
  const [lastSaved, setLastSaved] = useState(saved);
  const [draft, setDraft] = useState(saved);
  const [hexText, setHexText] = useState(saved.customAccent ?? CUSTOM_FALLBACK);
  const [busy, setBusy] = useState<'save' | 'reset' | 'image' | null>(null);
  const [error, setError] = useState('');
  // The saved value arrived (or changed): start the draft from it.
  if (saved !== lastSaved) {
    setLastSaved(saved);
    setDraft(saved);
    setHexText(saved.customAccent ?? CUSTOM_FALLBACK);
  }

  const hexValid = isHexColor(hexText);
  const candidate: Appearance | null =
    draft.accent === 'custom'
      ? hexValid
        ? { ...draft, customAccent: hexText.toLowerCase() }
        : null
      : { ...draft, customAccent: null };
  const problems = candidate ? contrastProblems(candidate) : [];
  const dirty = !candidate || !sameAppearance(candidate, saved);
  const blocked = problems.length > 0 || !candidate;
  const status = busy
    ? t('appearance.status.saving')
    : blocked
      ? t('appearance.status.blocked')
      : dirty
        ? t('appearance.status.unsaved')
        : t('appearance.status.saved');

  const patch = (change: Partial<Appearance>) => {
    setError('');
    setDraft((current) => ({ ...current, ...change }));
  };
  const submit = async () => {
    if (!candidate || blocked) return;
    setBusy('save');
    setError('');
    const result = await save(candidate);
    setBusy(null);
    if (!result.ok) setError(result.message || t('appearance.error'));
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
    else setError(result.message || t('appearance.error'));
  };
  const dropImage = async () => {
    setBusy('image');
    setError('');
    const result = await removeImage();
    setBusy(null);
    if (result.ok) toast.success(t('appearance.imageRemoved'));
    else setError(result.message || t('appearance.error'));
  };
  const restore = async () => {
    setBusy('reset');
    setError('');
    const result = await reset();
    setBusy(null);
    if (result.ok) toast.success(t('appearance.resetDone'));
    else setError(result.message || t('appearance.error'));
  };

  return (
    <SettingsGroup id="ui-appearance-server" title={t('appearance.title')}>
      <p className="p-4 text-sm text-muted-foreground">{t('appearance.intro')}</p>
      {failed && (
        <div className="p-4">
          <Alert variant="destructive">
            <TriangleAlert aria-hidden="true" />
            <AlertDescription>{t('appearance.loadFailed')}</AlertDescription>
          </Alert>
        </div>
      )}

      <SettingRow label={t('appearance.accent')} description={t('appearance.accentHint')}>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={1}
          className="flex-wrap sm:justify-end"
          aria-label={t('appearance.accent')}
          value={draft.accent}
          onValueChange={(next) => {
            if (next === 'custom' || (ACCENT_IDS as readonly string[]).includes(next))
              patch({ accent: next as AccentId | 'custom' });
          }}
        >
          {ACCENT_IDS.map((id) => (
            <ToggleGroupItem key={id} value={id} className="gap-2 px-3 pointer-coarse:h-11">
              <span
                aria-hidden="true"
                className="size-3 rounded-full border"
                style={{ backgroundColor: ACCENT_PRESETS[id][theme] }}
              />
              {t(`appearance.accent.${id}` as MessageKey)}
            </ToggleGroupItem>
          ))}
          <ToggleGroupItem value="custom" className="px-3 pointer-coarse:h-11">
            {t('appearance.accent.custom')}
          </ToggleGroupItem>
        </ToggleGroup>
      </SettingRow>
      {draft.accent === 'custom' && (
        <SettingRow
          htmlFor="appearance-hex"
          label={t('appearance.customHex')}
          description={t('appearance.customHexHint')}
        >
          <div className="flex w-full flex-col gap-1 sm:w-48">
            <Input
              id="appearance-hex"
              autoComplete="off"
              spellCheck={false}
              maxLength={7}
              value={hexText}
              aria-invalid={hexValid ? undefined : true}
              aria-describedby="appearance-hex-error"
              onChange={(event) => {
                setError('');
                setHexText(event.target.value.trim());
              }}
            />
            <FormError id="appearance-hex-error">
              {hexValid ? '' : t('appearance.customHexInvalid')}
            </FormError>
          </div>
        </SettingRow>
      )}

      <SettingRow label={t('appearance.background')} description={t('appearance.backgroundHint')}>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={1}
          className="flex-wrap sm:justify-end"
          aria-label={t('appearance.background')}
          value={draft.background}
          onValueChange={(next) => {
            if ((BACKGROUND_IDS as readonly string[]).includes(next))
              patch({ background: next as BackgroundId });
          }}
        >
          {BACKGROUND_IDS.map((id) => (
            <ToggleGroupItem key={id} value={id} className="gap-2 px-3 pointer-coarse:h-11">
              <span
                aria-hidden="true"
                className="size-3 rounded-full border bg-background"
                style={{ backgroundImage: swatchBackground(id, theme) }}
              />
              {t(`appearance.background.${id}` as MessageKey)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </SettingRow>

      <SettingRow label={t('appearance.image')} description={t('appearance.imageHint')}>
        {phone ? (
          <p className="max-w-[40ch] text-sm text-muted-foreground">{t('appearance.imagePhone')}</p>
        ) : (
          <div
            data-testid="image-dropzone"
            data-dragging={dragging || undefined}
            className="flex w-full flex-col items-start gap-2 rounded-lg border border-dashed p-3 data-[dragging=true]:border-primary sm:w-80"
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files[0];
              if (file && busy === null) void send(file);
            }}
          >
            <p className="text-sm text-muted-foreground">{t('appearance.imageDrop')}</p>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              tabIndex={-1}
              aria-label={t('appearance.imageChoose')}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void send(file);
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="pointer-coarse:h-11"
                disabled={busy !== null}
                onClick={() => fileInput.current?.click()}
              >
                {busy === 'image' && <Spinner data-icon="inline-start" />}
                {saved.image ? t('appearance.imageReplace') : t('appearance.imageChoose')}
              </Button>
              {saved.image && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="pointer-coarse:h-11"
                  disabled={busy !== null}
                  onClick={() => void dropImage()}
                >
                  {t('appearance.imageRemove')}
                </Button>
              )}
            </div>
            <p aria-live="polite" className="text-sm">
              {busy === 'image'
                ? t('appearance.imageWorking')
                : saved.image
                  ? t('appearance.imageSizes', {
                      before: formatBytes(saved.image.originalBytes),
                      after: formatBytes(saved.image.bytes),
                      width: saved.image.width,
                      height: saved.image.height,
                    })
                  : t('appearance.imageNone')}
            </p>
          </div>
        )}
      </SettingRow>
      {draft.image && (
        <>
          <SettingRow label={t('appearance.imageDim')} description={t('appearance.imageDimHint')}>
            <div className="flex w-full items-center gap-3 sm:w-64">
              <Slider
                aria-label={t('appearance.imageDim')}
                min={0}
                max={IMAGE_DIM_MAX}
                step={IMAGE_DIM_STEP}
                disabled={phone}
                value={[draft.image.dim]}
                onValueChange={([dim]) =>
                  setDraft((current) =>
                    current.image && dim !== undefined
                      ? { ...current, image: { ...current.image, dim } }
                      : current,
                  )
                }
              />
              <span className="w-12 text-right font-mono text-sm">
                {t('appearance.imageDimValue', { value: draft.image.dim })}
              </span>
            </div>
          </SettingRow>
          <SettingRow label={t('appearance.imagePosition')}>
            <Segmented<ImagePosition>
              label={t('appearance.imagePosition')}
              value={draft.image.position}
              onChange={(position) =>
                setDraft((current) =>
                  current.image ? { ...current, image: { ...current.image, position } } : current,
                )
              }
              options={IMAGE_POSITIONS.map((position) => ({
                value: position,
                label: t(`appearance.imagePosition.${position}` as MessageKey),
              }))}
            />
          </SettingRow>
        </>
      )}

      <SettingRow
        htmlFor="appearance-opacity"
        label={t('appearance.cardOpacity')}
        description={t('appearance.cardOpacityHint')}
      >
        <FormSelect
          id="appearance-opacity"
          aria-label={t('appearance.cardOpacity')}
          className="sm:w-32"
          value={draft.cardOpacity}
          onChange={(event) => patch({ cardOpacity: Number(event.target.value) })}
        >
          {OPACITIES.map((value) => (
            <FormSelectOption key={value} value={value}>
              {t('appearance.cardOpacityOption', { value })}
            </FormSelectOption>
          ))}
        </FormSelect>
      </SettingRow>
      <SettingRow
        htmlFor="appearance-blur"
        label={t('appearance.blur')}
        description={t('appearance.blurHint')}
      >
        <Switch
          id="appearance-blur"
          checked={draft.blur}
          onCheckedChange={(blur) => patch({ blur })}
        />
      </SettingRow>

      <div className="flex flex-col gap-2 p-4">
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

      <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 flex flex-col gap-3 rounded-b-lg border-t bg-background p-4 sm:flex-row sm:items-center sm:justify-between md:static md:bottom-auto">
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
            disabled={busy !== null || (sameAppearance(saved, DEFAULT_APPEARANCE) && !dirty)}
            onClick={() => void restore()}
          >
            {busy === 'reset' && <Spinner data-icon="inline-start" />}
            {t('appearance.reset')}
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
    </SettingsGroup>
  );
}
