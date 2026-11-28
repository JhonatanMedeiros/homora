import { Plus } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { MAX_WIDGETS_PER_PAGE } from '@homora/shared';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@homora/ui/alert-dialog';
import { Button } from '@homora/ui/button';
import { t } from '@/i18n';

export const TOOLBAR_BUTTON = 'max-md:min-h-11 pointer-coarse:min-h-11';

/** Long labels take a second line rather than leaving a narrow button. */
const WRAPPING_BUTTON = `${TOOLBAR_BUTTON} h-auto min-h-8 whitespace-normal`;

type Props = {
  phone: boolean;
  full: boolean;
  saving: boolean;
  removing: boolean;
  error: string;
  onAdd: () => void;
  onRestore: () => void;
  onCancel: () => void;
  onDone: () => void;
};

/** The actions of the Summary editor, kept in reach while the page scrolls. */
export function SummaryToolbar({
  phone,
  full,
  saving,
  removing,
  error,
  onAdd,
  onRestore,
  onCancel,
  onDone,
}: Props) {
  const toolbar = useRef<HTMLDivElement>(null);
  // The button that started the editor is gone: the keyboard continues from here.
  useEffect(() => toolbar.current?.focus(), []);
  return (
    <div
      ref={toolbar}
      tabIndex={-1}
      role="toolbar"
      aria-label={t('summarygrid.toolbar')}
      className="sticky top-0 z-20 flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={WRAPPING_BUTTON}
          disabled={full}
          onClick={onAdd}
        >
          <Plus />
          {t('summarygrid.addWidget')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={WRAPPING_BUTTON}
          onClick={onRestore}
        >
          {t('summarygrid.reset')}
        </Button>
        <div className="col-span-2 grid grid-cols-2 gap-2 sm:ml-auto sm:flex">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={TOOLBAR_BUTTON}
            onClick={onCancel}
          >
            {t('summarygrid.cancel')}
          </Button>
          <Button
            type="button"
            size="sm"
            className={TOOLBAR_BUTTON}
            disabled={saving}
            onClick={onDone}
          >
            {t('summarygrid.done')}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {t(phone ? 'summarygrid.hint.phone' : 'summarygrid.hint.wide')}
        {full && ` ${t('pageWidgets.limit', { max: MAX_WIDGETS_PER_PAGE })}`}
      </p>
      {removing && <p className="text-xs font-medium">{t('summarygrid.pendingRemoval')}</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Asked before a save that deletes widgets which cannot be added back as they were. */
export function ConfirmDeletion({
  names,
  onCancel,
  onConfirm,
}: {
  /** The widgets in question; null while nothing is being asked. */
  names: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog
      open={names !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('summarygrid.deleteTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('summarygrid.deleteNote', { names: names ?? '' })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('pages.cancel')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {t('summarygrid.deleteAction')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
