import { useState, type FormEvent } from 'react';
import { Plus, SlidersHorizontal } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { t } from '@/i18n';

type Props = {
  /** When renaming, new group form is replaced by the rename form. */
  renaming: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onCancelRename: () => void;
};

/** Organize mode panel: a one-line hint, a button that opens the new group form, and group renaming. */
export function OrganizePanel({ renaming, draft, onDraftChange, onSubmit, onCancelRename }: Props) {
  const [adding, setAdding] = useState(false);
  return (
    <>
      <Alert
        role="group"
        aria-label={t('organize.region')}
        className="items-center [&>svg]:translate-y-0"
      >
        <SlidersHorizontal aria-hidden="true" />
        <AlertDescription className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-foreground">
          <span>{t('organize.help')}</span>
          {!renaming && !adding && (
            <Button
              data-group-add
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setAdding(true)}
            >
              <Plus />
              {t('organize.newGroup')}
            </Button>
          )}
        </AlertDescription>
      </Alert>
      {!renaming && adding && (
        <form
          onSubmit={(event) => {
            onSubmit(event);
            setAdding(false);
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <Field className="w-auto min-w-48 flex-1">
            <FieldLabel htmlFor="new-group">{t('organize.newGroup')}</FieldLabel>
            <Input
              id="new-group"
              data-group-input
              autoFocus
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              maxLength={40}
              placeholder={t('organize.placeholder')}
            />
          </Field>
          <Button data-group-add type="submit" variant="secondary" disabled={!draft.trim()}>
            {t('organize.create')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
            {t('organize.cancelNew')}
          </Button>
        </form>
      )}
      {renaming && (
        <form
          aria-label={t('organize.renameForm')}
          onSubmit={onSubmit}
          className="flex flex-wrap items-end gap-2"
        >
          <Field className="w-auto min-w-48 flex-1">
            <FieldLabel htmlFor="rename-group">{t('organize.newName')}</FieldLabel>
            <Input
              id="rename-group"
              autoFocus
              maxLength={40}
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
            />
          </Field>
          <Button type="submit">{t('organize.saveName')}</Button>
          <Button type="button" variant="ghost" onClick={onCancelRename}>
            {t('common.cancel')}
          </Button>
        </form>
      )}
    </>
  );
}
