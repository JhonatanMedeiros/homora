import { Check } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/copy-button';
import { t } from '@/i18n';
import { ImportPreview } from '@/features/transfer/import-preview';
import { SuggestionList } from './suggestion-list';
import { DiscoveryReviewDialog } from './review-dialog';
import { SkippedContainers } from './skipped-containers';
import { usePushSources } from '@/hooks/use-push-sources';

type DialogState = Pick<
  ReturnType<typeof usePushSources>,
  | 'adding'
  | 'setAdding'
  | 'name'
  | 'setName'
  | 'token'
  | 'setToken'
  | 'busy'
  | 'preview'
  | 'setPreview'
  | 'selected'
  | 'setSelected'
  | 'confirm'
  | 'setConfirm'
  | 'change'
  | 'createSource'
  | 'reviewing'
  | 'startReview'
  | 'previewName'
  | 'items'
>;

const confirmText = {
  revoke: ['push.confirmRevoke', 'push.revokeBody'],
  rotate: ['push.confirmRotate', 'push.rotateBody'],
  remove: ['push.confirmRemove', 'push.removeBody'],
} as const;

export function PushSourceDialogs({ state }: { state: DialogState }) {
  const {
    adding,
    setAdding,
    name,
    setName,
    token,
    setToken,
    busy,
    preview,
    setPreview,
    selected,
    setSelected,
    confirm,
    setConfirm,
    change,
    createSource,
    reviewing,
    startReview,
    previewName,
    items,
  } = state;

  return (
    <>
      <Dialog
        open={adding}
        onOpenChange={(open) => {
          setAdding(open);
          if (!open) setName('');
        }}
      >
        <DialogContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void createSource();
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('push.addTitle')}</DialogTitle>
              <DialogDescription>{t('push.addHint')}</DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="push-name">{t('push.name')}</FieldLabel>
              <Input
                id="push-name"
                value={name}
                maxLength={80}
                required
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                {t('push.cancel')}
              </Button>
              <Button disabled={busy || !name.trim()} type="submit">
                {busy && <Spinner data-icon="inline-start" />}
                {t('push.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={token !== null} onOpenChange={() => {}}>
        <DialogContent
          showCloseButton={false}
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{t('push.tokenTitle', { name: token?.name ?? '' })}</DialogTitle>
            <DialogDescription>{t('push.token')}</DialogDescription>
          </DialogHeader>
          <code className="rounded-md border bg-background p-3 font-mono text-sm break-all select-all">
            {token?.value}
          </code>
          <DialogFooter>
            <CopyButton
              text={token?.value ?? ''}
              label={t('push.tokenCopy')}
              doneLabel={t('push.tokenCopied')}
            />
            <Button type="button" onClick={() => setToken(null)}>
              <Check data-icon="inline-start" />
              {t('push.dismiss')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('push.reviewTitle', { name: previewName ?? '' })}</DialogTitle>
            <DialogDescription>{t('push.reviewHint')}</DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="flex flex-col gap-4">
              {items.length === 0 && <p className="text-sm">{t('discovery.none')}</p>}
              {preview.plan.issues.length > 0 && (
                <ImportPreview plan={{ ...preview.plan, services: [] }} />
              )}
              {items.length > 0 && (
                <SuggestionList
                  idPrefix="push"
                  label={t('discovery.list')}
                  items={items}
                  selected={selected}
                  onChange={setSelected}
                />
              )}
              <SkippedContainers
                skipped={preview.skipped ?? []}
                total={preview.skippedTotal ?? 0}
              />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setPreview(null)}>
              {t('push.cancel')}
            </Button>
            <Button type="button" disabled={busy || selected.size === 0} onClick={startReview}>
              {t('discovery.review')} ({selected.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DiscoveryReviewDialog review={reviewing} />

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm && t(confirmText[confirm.action][0])} · {confirm?.source.name}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm && t(confirmText[confirm.action][1])}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('push.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (confirm) void change(confirm.source, confirm.action);
              }}
            >
              {confirm && t(confirmText[confirm.action][0])}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
