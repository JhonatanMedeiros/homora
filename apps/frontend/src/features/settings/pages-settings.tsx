import { toast } from 'sonner';
import { useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { MAX_PAGES, PAGE_NAME_MAX } from '@homora/shared';
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
import { Input } from '@/components/ui/input';
import { usePages, type PageRow } from '@/hooks/use-pages';
import { t } from '@/i18n';
import { SettingsGroup } from './setting-row';

/** Pages (the tabs of the Home): add, rename, reorder and delete. Saved on the server. */
export function PagesSettings({ onChanged }: { onChanged?: () => void | Promise<void> }) {
  const { pages, loaded, loadFailed, add, rename, remove, reorder } = usePages();
  const [draft, setDraft] = useState('');
  const [renaming, setRenaming] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [deleting, setDeleting] = useState<PageRow | null>(null);
  const [moveTo, setMoveTo] = useState('');
  const [error, setError] = useState('');
  const full = pages.length >= MAX_PAGES;

  async function finish(failure: string | null) {
    setError(failure ?? '');
    if (failure) toast.error(failure);
    else toast.success(t('pages.saved'));
    if (!failure) await onChanged?.();
    return failure === null;
  }
  async function submitAdd(event: FormEvent) {
    event.preventDefault();
    if (await finish(await add(draft))) setDraft('');
  }
  async function submitRename(event: FormEvent) {
    event.preventDefault();
    if (renaming !== null && (await finish(await rename(renaming, renameDraft)))) setRenaming(null);
  }
  async function move(index: number, direction: -1 | 1) {
    const ids = pages.map((page) => page.id);
    const to = index + direction;
    if (to < 0 || to >= ids.length) return;
    [ids[index], ids[to]] = [ids[to], ids[index]];
    await finish(await reorder(ids));
  }
  function askDelete(page: PageRow) {
    setDeleting(page);
    setMoveTo(String(pages.find((item) => item.id !== page.id)?.id ?? ''));
  }
  async function confirmDelete() {
    if (!deleting) return;
    const target = deleting.groups > 0 ? Number(moveTo) : undefined;
    setDeleting(null);
    await finish(await remove(deleting.id, target));
  }

  return (
    <SettingsGroup id="ui-pages" title={t('pages.title')}>
      <div className="flex flex-col gap-4 p-4">
        <p className="text-sm text-muted-foreground">{t('pages.intro', { max: MAX_PAGES })}</p>
        {loadFailed && <FormError>{t('pages.loadFailed')}</FormError>}
        {loaded && (
          <ul className="flex flex-col gap-2">
            {pages.map((page, index) => (
              <li key={page.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                {renaming === page.id ? (
                  <form className="flex min-w-0 flex-1 flex-wrap gap-2" onSubmit={submitRename}>
                    <Input
                      aria-label={t('pages.name')}
                      className="min-w-0 flex-1"
                      maxLength={PAGE_NAME_MAX}
                      value={renameDraft}
                      autoFocus
                      onChange={(event) => setRenameDraft(event.target.value)}
                    />
                    <Button type="submit" className="pointer-coarse:h-11">
                      {t('pages.save')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="pointer-coarse:h-11"
                      onClick={() => setRenaming(null)}
                    >
                      {t('pages.cancel')}
                    </Button>
                  </form>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 break-words font-medium">{page.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {t('pages.groups', { count: page.groups })}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="pointer-coarse:size-11"
                        aria-label={t('pages.moveUp', { name: page.name })}
                        disabled={index === 0}
                        onClick={() => void move(index, -1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="pointer-coarse:size-11"
                        aria-label={t('pages.moveDown', { name: page.name })}
                        disabled={index === pages.length - 1}
                        onClick={() => void move(index, 1)}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="pointer-coarse:size-11"
                        aria-label={`${t('pages.rename')} ${page.name}`}
                        onClick={() => {
                          setRenaming(page.id);
                          setRenameDraft(page.name);
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="pointer-coarse:size-11"
                        aria-label={`${t('pages.delete')} ${page.name}`}
                        disabled={pages.length < 2}
                        onClick={() => askDelete(page)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <form className="flex flex-wrap gap-2" onSubmit={submitAdd}>
          <Input
            aria-label={t('pages.name')}
            className="min-w-0 flex-1"
            maxLength={PAGE_NAME_MAX}
            value={draft}
            disabled={full}
            placeholder={t('pages.name')}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="submit" disabled={full || !draft.trim()} className="pointer-coarse:h-11">
            <Plus />
            {t('pages.add')}
          </Button>
        </form>
        {full && (
          <p className="text-sm text-muted-foreground">{t('pages.limit', { max: MAX_PAGES })}</p>
        )}
        <FormError>{error}</FormError>
      </div>
      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('pages.deleteTitle', { name: deleting?.name ?? '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && deleting.groups > 0 ? t('pages.deleteMove') : t('pages.deleteEmpty')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleting && deleting.groups > 0 && (
            <FormSelect
              aria-label={t('pages.moveTo')}
              value={moveTo}
              onChange={(event) => setMoveTo(event.target.value)}
            >
              {pages
                .filter((page) => page.id !== deleting.id)
                .map((page) => (
                  <FormSelectOption key={page.id} value={String(page.id)}>
                    {page.name}
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
    </SettingsGroup>
  );
}
