import { toast } from 'sonner';
import { useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { PAGE_NAME_MAX } from '@homora/shared';
import { FormError } from '@/components/form-error';
import { FormSelect, FormSelectOption } from '@/components/form-select';
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
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { usePages, type PageRow } from '@/hooks/use-pages';
import { t } from '@/i18n';

type Props = {
  /** The page whose tab is selected; the menu acts on it. */
  page: PageRow;
  /** Called after a change was saved, so the Home reloads its pages. */
  onChanged: () => void | Promise<void>;
};

/**
 * "..." next to the selected page tab: rename, move earlier or later, delete. The same actions as
 * Settings → Pages, kept here so a page can be tidied without leaving the Home. Deleting a page
 * that holds groups or widgets asks where they go; nothing is lost silently.
 */
export function PageTabMenu({ page, onChanged }: Props) {
  const { pages, rename, remove, reorder } = usePages();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [moveTo, setMoveTo] = useState('');
  // The Home's page row carries the counts; usePages loads its own list for ordering.
  const index = pages.findIndex((item) => item.id === page.id);
  const current = pages[index] ?? page;
  const holdsContent = current.groups > 0 || (current.widgets ?? 0) > 0;

  async function finish(failure: string | null) {
    if (failure) {
      setError(failure);
      toast.error(failure);
      return false;
    }
    setError('');
    toast.success(t('pages.saved'));
    await onChanged();
    return true;
  }
  async function submitRename(event: FormEvent) {
    event.preventDefault();
    if (await finish(await rename(page.id, draft))) setRenaming(false);
  }
  async function move(direction: -1 | 1) {
    const ids = pages.map((item) => item.id);
    const to = index + direction;
    if (index < 0 || to < 0 || to >= ids.length) return;
    [ids[index], ids[to]] = [ids[to]!, ids[index]!];
    await finish(await reorder(ids));
  }
  async function confirmDelete() {
    const target = holdsContent ? Number(moveTo) : undefined;
    setDeleting(false);
    await finish(await remove(page.id, target));
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('pages.menu', { name: page.name })}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              setDraft(page.name);
              setError('');
              setRenaming(true);
            }}
          >
            <Pencil /> {t('pages.rename')}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={index <= 0} onSelect={() => void move(-1)}>
            <ArrowLeft /> {t('pages.moveEarlier')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={index < 0 || index >= pages.length - 1}
            onSelect={() => void move(1)}
          >
            <ArrowRight /> {t('pages.moveLater')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={pages.length < 2}
            onSelect={() => {
              setMoveTo(String(pages.find((item) => item.id !== page.id)?.id ?? ''));
              setDeleting(true);
            }}
          >
            <Trash2 /> {t('pages.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent>
          <form className="flex flex-col gap-4" onSubmit={submitRename}>
            <DialogHeader>
              <DialogTitle>{t('pages.rename')}</DialogTitle>
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
              <Button type="button" variant="ghost" onClick={() => setRenaming(false)}>
                {t('pages.cancel')}
              </Button>
              <Button type="submit" disabled={!draft.trim()}>
                {t('pages.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('pages.deleteTitle', { name: page.name })}</AlertDialogTitle>
            <AlertDialogDescription>
              {holdsContent ? t('pageWidgets.deleteMove') : t('pages.deleteEmpty')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {holdsContent && (
            <FormSelect
              aria-label={t('pages.moveTo')}
              value={moveTo}
              onChange={(event) => setMoveTo(event.target.value)}
            >
              {pages
                .filter((item) => item.id !== page.id)
                .map((item) => (
                  <FormSelectOption key={item.id} value={String(item.id)}>
                    {item.name}
                  </FormSelectOption>
                ))}
            </FormSelect>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{t('pages.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void confirmDelete()}>
              {t('pages.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
