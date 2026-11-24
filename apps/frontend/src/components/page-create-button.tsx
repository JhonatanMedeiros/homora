import { toast } from 'sonner';
import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { PAGE_NAME_MAX } from '@homora/shared';
import { Button } from '@homora/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@homora/ui/dialog';
import { Input } from '@homora/ui/input';
import { FormError } from '@/components/form-error';
import { addPage, type PageRow } from '@/hooks/use-pages';
import { t } from '@/i18n';

type Props = {
  pages: PageRow[];
  onChanged: () => unknown | Promise<unknown>;
  onCreated: (id: number) => void;
  /** `icon` is the compact "+" of the page bar; `labeled` is a full-width button with its name. */
  variant?: 'icon' | 'labeled';
};

/** Adds a page: a button, and the dialog that asks for its name. */
export function PageCreateButton({ pages, onChanged, onCreated, variant = 'icon' }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    const previousIds = new Set(pages.map((page) => page.id));
    let createdId: number | undefined;
    const failure = await addPage(draft, (next) => {
      const created = next.find((page) => !previousIds.has(page.id));
      if (created) createdId = created.id;
    });
    if (failure) {
      setError(failure);
      toast.error(failure);
      return;
    }
    setError('');
    setOpen(false);
    setDraft('');
    toast.success(t('pages.saved'));
    await onChanged();
    if (createdId !== undefined) onCreated(createdId);
  }

  function openDialog() {
    setDraft('');
    setError('');
    setOpen(true);
  }

  return (
    <>
      {variant === 'labeled' ? (
        <Button type="button" className="h-11 w-full cursor-pointer gap-2" onClick={openDialog}>
          <Plus aria-hidden="true" /> {t('pages.add')}
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t('pages.add')}
          title={t('pages.add')}
          className="size-9 shrink-0 cursor-pointer text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground pointer-coarse:size-11"
          onClick={openDialog}
        >
          <Plus aria-hidden="true" />
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{t('pages.add')}</DialogTitle>
            </DialogHeader>
            <Input
              aria-label={t('pages.name')}
              maxLength={PAGE_NAME_MAX}
              value={draft}
              autoFocus
              onChange={(event) => setDraft(event.target.value)}
            />
            <FormError>{error}</FormError>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {t('pages.cancel')}
              </Button>
              <Button type="submit" disabled={!draft.trim()}>
                {t('pages.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
