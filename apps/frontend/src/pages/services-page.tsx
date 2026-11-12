import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type MutableRefObject,
} from 'react';
import type { Service, ServiceInput } from '@homora/shared';
import { Check, Plus, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { ViewOptions } from '@/components/view-options';
import { useViewPreferences } from '@/hooks/use-view-preferences';
import { CategoryFilter } from '@/components/category-filter';
import { FormError } from '@/components/form-error';
import { HealthSummary } from '@/components/health-summary';
import { TopBar } from '@/components/top-bar';
import { useTopBar } from '@/hooks/use-top-bar';
import { GroupSection } from '@/components/group-section';
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
import { toast } from 'sonner';
import { OrganizePanel } from '@/components/organize-panel';
import { PageHeader } from '@/components/page-header';
import { ServiceCard } from '@/components/service-card';
import { useCardWidgets } from '@/hooks/use-card-widgets';
import { ServiceForm } from '@/components/service-form';
import { OrganizeRow } from '@/components/organize-row';
import { ServicesEmpty } from '@/components/services-empty';
import type { useServices } from '@/hooks/use-services';
import { apiError, lower, t } from '@/i18n';
import { emptyService } from '@/lib/services';

/** Main screen: service groups with status, search, edit, and Organize mode. */
type Props = {
  query: string;
  managing: boolean;
  formRoute: 'new' | number | null;
  navigate: (path: string, replace?: boolean) => void;
  onAddService: () => void;
  data: ReturnType<typeof useServices>;
  /** Set by the command palette: scroll to this service and highlight it briefly. */
  focusRequest?: FocusRequest | null;
  /** Called once the request was served, so remounting the page later does not scroll again. */
  onFocusHandled?: () => void;
  /** Search opens the first result on Enter; the page registers here how to do so. */
  openFirstRef: MutableRefObject<(() => void) | null>;
};

/** Asks the page to scroll to a service and flash it; `nonce` makes repeated requests distinct. */
export type FocusRequest = { id: number; nonce: number };

const HIGHLIGHT_MS = 2000;

export function ServicesPage({
  query,
  data,
  openFirstRef,
  managing,
  onAddService,
  formRoute,
  navigate,
  focusRequest,
  onFocusHandled,
}: Props) {
  const { services, groupRows, statuses, categories, sortedIn, blockedIds, refresh } = data;
  const cardWidgets = useCardWidgets();
  const [topBar] = useTopBar();
  const { view, setView, showDescriptions, setShowDescriptions } = useViewPreferences();
  const list = view === 'list';
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<ServiceInput>(emptyService);
  const [shared, setShared] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [organizing, setOrganizing] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropOver, setDropOver] = useState<number | null>(null);
  const [dropGroup, setDropGroup] = useState<string | null>(null);
  const [removingGroup, setRemovingGroup] = useState<{ id: number; name: string } | null>(null);
  const [message, setMessage] = useState('');
  const [flash, setFlash] = useState('');
  // Quiet live-region text for screen readers (e.g. new position after an arrow press).
  const [srNote, setSrNote] = useState('');
  const [editingGroup, setEditingGroup] = useState<number | null>(null);
  const [groupDraft, setGroupDraft] = useState('');
  const [groupError, setGroupError] = useState('');
  const flashTimer = useRef<number | undefined>(undefined);
  const initializedRoute = useRef<'new' | number | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);

  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  // "Go to card": clear the category filter, let the group expand, then scroll and flash the card.
  const focusService = focusRequest ? services.find((s) => s.id === focusRequest.id) : undefined;
  const focusNonce = focusRequest?.nonce;
  useEffect(() => {
    if (focusNonce === undefined || !focusService) return;
    const timers: number[] = [];
    // Two steps: first lift the category filter that could hide the card, then, once the group has
    // rendered and expanded, scroll and flash.
    timers.push(
      window.setTimeout(() => {
        setSelected(null);
        timers.push(
          window.setTimeout(() => {
            const card = document.getElementById(`service-${focusService.id}`);
            if (card) {
              const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
              card.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
              card.dataset.highlight = 'true';
              // Not cancelled on cleanup: handing the request back re-runs this effect.
              window.setTimeout(() => delete card.dataset.highlight, HIGHLIGHT_MS);
            }
            onFocusHandled?.();
          }, 50),
        );
      }, 0),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
    // Only a new request (nonce) should trigger it, not later edits to the service list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNonce, focusService?.id]);
  function announce(text: string) {
    setFlash(text);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(''), 5000);
  }

  const needle = lower(query).trim();
  const filtered = services.filter(
    (s) =>
      (selected === null || s.category === selected) &&
      lower(`${s.name} ${s.category} ${s.description} ${s.url}`).includes(needle),
  );
  const isDown = (s: Service) => statuses[s.id]?.status === 'unavailable' && !blockedIds.has(s.id);
  const groups = categories
    .map((category) => ({
      category,
      items: sortedIn(category)
        .filter((s) => filtered.some((f) => f.id === s.id))
        // Unavailable services rise to top within the group, except in Organize mode (user sets order).
        .sort((a, b) => (organizing ? 0 : Number(isDown(b)) - Number(isDown(a)))),
    }))
    .filter((group) => group.items.length || (!needle && selected === null));

  useEffect(() => {
    const ref = openFirstRef;
    ref.current = () => {
      const first = groups.flatMap((group) => group.items)[0];
      if (first) window.open(first.url, '_blank', 'noopener,noreferrer');
    };
    return () => {
      ref.current = null;
    };
  });

  function focusEditTrigger(id: number | null) {
    if (id !== null)
      document.querySelector<HTMLButtonElement>(`[data-service-edit="${id}"]`)?.focus();
    else addButton.current?.focus();
  }
  function openForm(service?: Service) {
    navigate(service ? `/manage/services/${service.id}/edit` : '/manage/services/new');
    setConfirming(null);
    setEditing(service?.id ?? null);
    setShared(service?.isPublic === true);
    setForm(
      service
        ? {
            name: service.name,
            url: service.url,
            category: service.category,
            description: service.description,
            icon: service.icon ?? '',
            position: service.position ?? 0,
            allowPrivate: service.allowPrivate === true,
            checkType: service.checkType ?? 'http',
            checkInterval: service.checkInterval ?? null,
            expectedStatus: service.expectedStatus ?? null,
            checkPath: service.checkPath ?? null,
          }
        : emptyService,
    );
    setFormError('');
    setFormOpen(true);
  }
  function closeForm() {
    try {
      sessionStorage.setItem('homora-focus-service', editing === null ? 'new' : String(editing));
    } catch {
      /* storage unavailable */
    }
    setFormOpen(false);
    navigate('/manage/services', true);
  }
  useEffect(() => {
    if (!managing || formRoute !== null) return;
    try {
      const value = sessionStorage.getItem('homora-focus-service');
      if (!value || (value !== 'new' && !data.loaded)) return;
      const target =
        value === 'new'
          ? addButton.current
          : (document.querySelector<HTMLButtonElement>(`[data-service-edit="${Number(value)}"]`) ??
            addButton.current);
      if (target) {
        target.focus();
        sessionStorage.removeItem('homora-focus-service');
      }
    } catch {
      /* storage unavailable */
    }
  }, [managing, formRoute, data.loaded, services]);
  useEffect(() => {
    if (formRoute === null) {
      initializedRoute.current = null;
      // Synchronize the controlled dialog with browser history.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormOpen(false);
      return;
    }
    const service =
      typeof formRoute === 'number' ? services.find((item) => item.id === formRoute) : undefined;
    if (initializedRoute.current === formRoute) return;
    if (typeof formRoute === 'number' && !service) {
      setFormOpen(false);
      return;
    }
    initializedRoute.current = formRoute;
    // Initialize the draft once per route after service data arrives.
    setEditing(service?.id ?? null);
    setShared(service?.isPublic === true);
    setForm(
      service
        ? {
            name: service.name,
            url: service.url,
            category: service.category,
            description: service.description,
            icon: service.icon ?? '',
            position: service.position ?? 0,
            allowPrivate: service.allowPrivate === true,
            checkType: service.checkType ?? 'http',
            checkInterval: service.checkInterval ?? null,
            expectedStatus: service.expectedStatus ?? null,
            checkPath: service.checkPath ?? null,
          }
        : emptyService,
    );
    setFormError('');
    setFormOpen(true);
  }, [formRoute, services]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (editingGroup !== null) {
        setEditingGroup(null);
        setGroupDraft('');
        document.querySelector<HTMLButtonElement>(`[data-group-edit="${editingGroup}"]`)?.focus();
      }
      setConfirming(null);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [editingGroup]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const response = await fetch(
        editing === null ? '/api/services' : `/api/services/${editing}`,
        {
          method: editing === null ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        },
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(body, t('error.save')));
      const savedId = editing ?? (body as { id?: number } | null)?.id;
      const wasShared =
        editing !== null && services.find((s) => s.id === editing)?.isPublic === true;
      if (savedId !== undefined && shared !== wasShared) {
        const visibility = await fetch(`/api/services/${savedId}/public`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isPublic: shared }),
        });
        if (!visibility.ok) throw new Error(t('error.savePublic'));
      }
      const wasNew = editing === null;
      closeForm();
      setSelected(null);
      await refresh();
      announce(wasNew ? t('page.added') : t('page.saved'));
    } catch (e) {
      setFormError(e instanceof Error && e.message ? e.message : t('error.save'));
    } finally {
      setSaving(false);
    }
  }
  async function remove(s: Service) {
    if (confirming !== s.id) {
      setConfirming(s.id);
      return;
    }
    setConfirming(null);
    try {
      const response = await fetch(`/api/services/${s.id}`, { method: 'DELETE' });
      if (!response.ok) throw Error();
      setSelected(null);
      await refresh();
      announce(t('page.removed'));
    } catch {
      setMessage(t('error.remove'));
    }
  }
  async function saveGroup(e: FormEvent) {
    e.preventDefault();
    setGroupError('');
    try {
      const response = await fetch(
        editingGroup === null ? '/api/groups' : `/api/groups/${editingGroup}`,
        {
          method: editingGroup === null ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: groupDraft }),
        },
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(body, t('error.saveGroup')));
      const wasEditing = editingGroup !== null;
      setEditingGroup(null);
      setGroupDraft('');
      setSelected(null);
      await refresh();
      if (wasEditing) document.querySelector<HTMLButtonElement>('[data-group-add]')?.focus();
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : t('error.saveGroup'));
    }
  }
  async function deleteGroup(id: number) {
    try {
      const response = await fetch(`/api/groups/${id}`, { method: 'DELETE' });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(body, t('error.removeGroup')));
      await refresh();
      document.querySelector<HTMLButtonElement>('[data-group-add]')?.focus();
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : t('error.removeGroup'));
    }
  }
  async function moveToGroup(service: Service, group: string) {
    // Captured before the move so Undo can restore the original position, not just the group.
    const originalOrder = sortedIn(service.category).map((item) => item.id);
    const failure = await data.moveServiceToGroup(service, group);
    if (failure) {
      setMessage(failure);
      return;
    }
    toast(t('page.moved', { name: service.name, group }), {
      duration: 8000,
      action: {
        label: t('common.undo'),
        onClick: () =>
          void data.restoreService(service, originalOrder).then((undoFailure) => {
            if (undoFailure) setMessage(undoFailure);
          }),
      },
    });
  }
  async function reorder(
    task: Promise<string | null>,
    index?: number,
    service?: Service,
    total?: number,
  ) {
    const failure = await task;
    if (failure) setMessage(failure);
    else if (service && index !== undefined && total)
      setSrNote(t('organize.position', { name: service.name, position: index + 1, total }));
  }

  const total = services.length;
  const online = services.filter((s) => statuses[s.id]?.status === 'available').length;
  const down = services.filter(
    (s) => statuses[s.id]?.status === 'unavailable' && !blockedIds.has(s.id),
  ).length;
  const blocked = services.filter(
    (s) => blockedIds.has(s.id) && statuses[s.id]?.status !== 'available',
  ).length;
  const unknown = total - online - down - blocked;
  return (
    <section
      aria-label={t('nav.services')}
      className={cn('flex flex-col gap-6', organizing && 'pb-20 md:pb-0')}
    >
      {managing && (
        <PageHeader
          title={t('manage.services')}
          description={
            total
              ? `${t('page.summary', { services: t('page.servicesCount', { count: total }), groups: t('page.groupsCount', { count: categories.length }) })} ${t('manage.serviceDescription')}`
              : t('page.emptyDescription')
          }
          actions={
            <>
              <Button
                type="button"
                variant="outline"
                aria-pressed={organizing}
                onClick={() => {
                  setOrganizing(!organizing);
                  setConfirming(null);
                }}
              >
                <SlidersHorizontal />
                {organizing ? t('page.done') : t('page.organize')}
              </Button>
              <Button ref={addButton} type="button" onClick={() => openForm()}>
                <Plus />
                {t('page.add')}
              </Button>
            </>
          }
        />
      )}
      {!managing && !organizing && topBar && <TopBar />}
      {!managing && (
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          {!organizing ? (
            <HealthSummary
              total={total}
              online={online}
              down={down}
              blocked={blocked}
              unknown={unknown}
            />
          ) : (
            <span />
          )}
          {services.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <ViewOptions
                view={view}
                onViewChange={setView}
                showDescriptions={showDescriptions}
                onShowDescriptionsChange={setShowDescriptions}
              />
            </div>
          )}
        </div>
      )}
      {!managing && data.statusError && (
        <p role="status" className="text-xs text-muted-foreground">
          {t('status.stale')}
        </p>
      )}
      {organizing && (
        <OrganizePanel
          renaming={editingGroup !== null}
          draft={groupDraft}
          onDraftChange={setGroupDraft}
          onSubmit={(event) => void saveGroup(event)}
          onCancelRename={() => {
            const id = editingGroup;
            setEditingGroup(null);
            setGroupDraft('');
            document.querySelector<HTMLButtonElement>(`[data-group-edit="${id}"]`)?.focus();
          }}
        />
      )}
      <FormError>{groupError}</FormError>
      {typeof formRoute === 'number' &&
        data.loaded &&
        !services.some((item) => item.id === formRoute) && (
          <Alert>
            <AlertDescription>
              {t('route.serviceNotFound')}{' '}
              <Button
                type="button"
                variant="link"
                onClick={() => navigate('/manage/services', true)}
              >
                {t('route.services')}
              </Button>
            </AlertDescription>
          </Alert>
        )}
      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          if (!open && !saving) closeForm();
        }}
      >
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl"
          showCloseButton={false}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            nameInput.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            focusEditTrigger(editing);
          }}
          onEscapeKeyDown={(event) => {
            if (saving) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (saving) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle className="font-label text-xl">
              {editing !== null ? t('form.editTitle') : t('form.newTitle')}
            </DialogTitle>
            <DialogDescription>{t('form.dialogDescription')}</DialogDescription>
          </DialogHeader>
          <ServiceForm
            nameRef={nameInput}
            editing={editing !== null}
            value={form}
            categories={categories}
            error={formError}
            saving={saving}
            isPublic={shared}
            onPublicChange={setShared}
            onChange={setForm}
            onSubmit={(event) => void save(event)}
            onCancel={closeForm}
          />
        </DialogContent>
      </Dialog>
      <div role="status" id="message" className="empty:hidden">
        {(message || data.loadError) && (
          <Alert variant="destructive">
            <AlertDescription>
              {message || data.loadError}
              {data.loadError && (
                <Button type="button" variant="link" onClick={() => void data.refresh()}>
                  {t('catalog.retry')}
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>
      <p role="status" className="sr-only">
        {srNote}
      </p>
      {flash && (
        <p
          role="status"
          className="motion-feedback flex w-fit items-center gap-2 rounded-md bg-success px-3 py-2 text-sm font-semibold text-success-foreground"
        >
          <Check className="size-4" aria-hidden="true" />
          {flash}
        </p>
      )}
      {!organizing && services.length > 0 && categories.length > 2 && (
        <CategoryFilter
          categories={categories}
          selected={selected}
          onSelect={setSelected}
          counts={(category) =>
            category === null
              ? services.length
              : services.filter((s) => s.category === category).length
          }
        />
      )}
      {groups.map(({ category, items }) => {
        const row = groupRows.find((group) => group.name === category);
        return (
          <GroupSection
            key={category}
            category={category}
            count={items.length}
            organizing={organizing}
            list={list}
            managing={managing}
            searching={Boolean(needle)}
            revealSignal={focusService?.category === category ? focusNonce : undefined}
            canEdit={Boolean(row)}
            canRemove={!services.some((service) => service.category === category)}
            groupId={row?.id}
            columns={row?.columns}
            onColumns={(columns) => row && void reorder(data.setGroupColumns(row.id, columns))}
            onRename={() => {
              if (!row) return;
              setEditingGroup(row.id);
              setGroupDraft(row.name);
            }}
            onRemove={() => row && setRemovingGroup({ id: row.id, name: row.name })}
            emptyDrop={{
              active: dragging !== null,
              over: dropGroup === category,
              onOver: () => setDropGroup(category),
              onLeave: () => setDropGroup((g) => (g === category ? null : g)),
              onDrop: () => {
                const dragged = services.find((item) => item.id === dragging);
                setDragging(null);
                setDropGroup(null);
                if (dragged && dragged.category !== category) void moveToGroup(dragged, category);
              },
            }}
            onMove={(direction) => void reorder(data.moveGroup(category, direction))}
          >
            {items.map((s, index) => {
              if (organizing) {
                const dragProps = {
                  onDragStart: (event: DragEvent) => {
                    setDragging(s.id);
                    event.dataTransfer.effectAllowed = 'move';
                  },
                  onDragEnd: () => {
                    setDragging(null);
                    setDropOver(null);
                    setDropGroup(null);
                  },
                  onDragOver: (event: DragEvent) => {
                    if (dragging !== null && dragging !== s.id) {
                      event.preventDefault();
                      setDropOver(s.id);
                    }
                  },
                  onDrop: (event: DragEvent) => {
                    event.preventDefault();
                    const dragged = services.find((item) => item.id === dragging);
                    setDragging(null);
                    setDropOver(null);
                    if (!dragged) return;
                    if (dragged.category !== s.category) {
                      void moveToGroup(dragged, s.category);
                      return;
                    }
                    void reorder(
                      data.placeService(
                        dragged,
                        sortedIn(s.category).findIndex((item) => item.id === s.id),
                      ),
                    );
                  },
                };
                return (
                  <OrganizeRow
                    key={s.id}
                    service={s}
                    otherGroups={categories.filter((name) => name !== s.category)}
                    first={index === 0}
                    last={index === items.length - 1}
                    dragging={dragging === s.id}
                    dropTarget={dropOver === s.id}
                    onMove={(direction) =>
                      void reorder(
                        data.placeService(s, index + direction),
                        index + direction,
                        s,
                        items.length,
                      )
                    }
                    onMoveToTop={() => void reorder(data.placeService(s, 0), 0, s, items.length)}
                    onMoveToGroup={(group) => void moveToGroup(s, group)}
                    dragProps={dragProps}
                  />
                );
              }
              const info = statuses[s.id];
              return (
                <ServiceCard
                  key={s.id}
                  service={s}
                  status={info}
                  widgets={cardWidgets[s.id]}
                  blocked={blockedIds.has(s.id)}
                  managing={managing}
                  list={list}
                  showDescription={showDescriptions || managing}
                  confirmingRemoval={confirming === s.id}
                  onEdit={() => openForm(s)}
                  onRemove={() => void remove(s)}
                  onCancelRemoval={() => setConfirming((c) => (c === s.id ? null : c))}
                />
              );
            })}
          </GroupSection>
        );
      })}
      <AlertDialog
        open={removingGroup !== null}
        onOpenChange={(open) => !open && setRemovingGroup(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('group.removeTitle', { name: removingGroup?.name ?? '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('group.removeBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => removingGroup && void deleteGroup(removingGroup.id)}
            >
              {t('common.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {organizing && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
          <span className="font-mono text-xs text-muted-foreground">{t('organize.bar')}</span>
          <Button
            type="button"
            aria-label={t('organize.finish')}
            onClick={() => {
              setOrganizing(false);
              setConfirming(null);
            }}
          >
            {t('page.done')}
          </Button>
        </div>
      )}
      {!data.loaded && !data.loadError && (
        <p role="status" className="flex items-center gap-2 text-muted-foreground">
          <Spinner />
          {t('common.loading')}
        </p>
      )}
      {data.loaded && !data.loadError && !groups.length && (
        <ServicesEmpty
          hasServices={services.length > 0}
          onAdd={() => (managing ? openForm() : onAddService())}
        />
      )}
    </section>
  );
}
