import { useEffect, useRef, useState, type FormEvent, type MutableRefObject } from 'react';
import type { Service, ServiceInput } from '@homora/shared';
import { Check, Plus, SlidersHorizontal } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CategoryFilter } from '@/components/category-filter';
import { FormError } from '@/components/form-error';
import { HealthSummary } from '@/components/health-summary';
import { GroupSection } from '@/components/group-section';
import { OrganizePanel } from '@/components/organize-panel';
import { PageHeader } from '@/components/page-header';
import { ServiceCard } from '@/components/service-card';
import { ServiceForm } from '@/components/service-form';
import { ServicesEmpty } from '@/components/services-empty';
import type { useServices } from '@/hooks/use-services';
import { emptyService } from '@/lib/services';
import { apiError, lower, t } from '@/i18n';

/** Tela principal: grupos de serviços com estado, busca, edição e modo Organizar. */
type Props = {
  query: string;
  data: ReturnType<typeof useServices>;
  /** A busca abre o primeiro resultado com Enter; a página registra aqui como fazê-lo. */
  openFirstRef: MutableRefObject<(() => void) | null>;
};

export function ServicesPage({ query, data, openFirstRef }: Props) {
  const { services, groupRows, statuses, categories, sortedIn, blockedIds, refresh } = data;
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<ServiceInput>(emptyService);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [organizing, setOrganizing] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [flash, setFlash] = useState('');
  const [editingGroup, setEditingGroup] = useState<number | null>(null);
  const [groupDraft, setGroupDraft] = useState('');
  const [groupError, setGroupError] = useState('');
  const flashTimer = useRef<number | undefined>(undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);

  useEffect(() => () => window.clearTimeout(flashTimer.current), []);
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
        // Indisponíveis sobem no grupo, exceto no modo Organizar (a ordem é do usuário).
        .sort((a, b) => (organizing ? 0 : Number(isDown(b)) - Number(isDown(a)))),
    }))
    .filter((group) => group.items.length || !needle);

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

  useEffect(() => {
    if (formOpen) {
      formRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
      nameInput.current?.focus({ preventScroll: true });
    }
  }, [formOpen]);

  function focusEditTrigger(id: number | null) {
    if (id !== null)
      document.querySelector<HTMLButtonElement>(`[data-service-edit="${id}"]`)?.focus();
    else addButton.current?.focus();
  }
  function openForm(service?: Service) {
    setConfirming(null);
    setEditing(service?.id ?? null);
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
          }
        : emptyService,
    );
    setFormError('');
    setFormOpen(true);
  }
  function closeForm() {
    setFormOpen(false);
    focusEditTrigger(editing);
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (formOpen) {
        setFormOpen(false);
        focusEditTrigger(editing);
      }
      if (editingGroup !== null) {
        setEditingGroup(null);
        setGroupDraft('');
        document.querySelector<HTMLButtonElement>(`[data-group-edit="${editingGroup}"]`)?.focus();
      }
      setConfirming(null);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [formOpen, editingGroup, editing]);

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
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw Error(body.error);
      const wasNew = editing === null;
      closeForm();
      setSelected(null);
      await refresh();
      announce(wasNew ? t('page.added') : t('page.saved'));
    } catch (e) {
      setFormError(e instanceof Error && e.message ? apiError(e.message) : t('error.save'));
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
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw Error(body.error || t('error.saveGroup'));
      const wasEditing = editingGroup !== null;
      setEditingGroup(null);
      setGroupDraft('');
      setSelected(null);
      await refresh();
      if (wasEditing) document.querySelector<HTMLButtonElement>('[data-group-add]')?.focus();
    } catch (error) {
      setGroupError(error instanceof Error ? apiError(error.message) : t('error.saveGroup'));
    }
  }
  async function deleteGroup(id: number) {
    try {
      const response = await fetch(`/api/groups/${id}`, { method: 'DELETE' });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw Error(body.error || t('error.removeGroup'));
      await refresh();
      document.querySelector<HTMLButtonElement>('[data-group-add]')?.focus();
    } catch (error) {
      setGroupError(error instanceof Error ? apiError(error.message) : t('error.removeGroup'));
    }
  }
  async function reorder(task: Promise<string | null>) {
    const failure = await task;
    if (failure) setMessage(failure);
  }

  const total = services.length;
  const online = services.filter((s) => statuses[s.id]?.status === 'available').length;
  const down = services.filter(
    (s) => statuses[s.id]?.status === 'unavailable' && !blockedIds.has(s.id),
  ).length;
  const blocked = services.filter(
    (s) => blockedIds.has(s.id) && statuses[s.id]?.status !== 'available',
  ).length;
  const monitored = total - blocked;
  return (
    <section aria-label={t('nav.services')} className="flex flex-col gap-6">
      <PageHeader
        title={t('page.title')}
        description={
          total
            ? t('page.summary', {
                services: t('page.servicesCount', { count: total }),
                groups: t('page.groupsCount', { count: categories.length }),
              })
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
      {!organizing && (
        <HealthSummary online={online} down={down} blocked={blocked} monitored={monitored} />
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
      {formOpen && (
        <ServiceForm
          ref={formRef}
          nameRef={nameInput}
          editing={editing !== null}
          value={form}
          categories={categories}
          error={formError}
          saving={saving}
          onChange={setForm}
          onSubmit={(event) => void save(event)}
          onCancel={closeForm}
        />
      )}
      <div role="status" id="message" className="empty:hidden">
        {(message || data.loadError) && (
          <Alert variant="destructive">
            <AlertDescription>{message || data.loadError}</AlertDescription>
          </Alert>
        )}
      </div>
      {flash && (
        <p
          role="status"
          className="flex w-fit items-center gap-2 rounded-md bg-success px-3 py-2 text-sm font-semibold text-success-foreground"
        >
          <Check className="size-4" aria-hidden="true" />
          {flash}
        </p>
      )}
      {!organizing && services.length > 0 && categories.length > 1 && (
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
            canEdit={Boolean(row)}
            canRemove={!services.some((service) => service.category === category)}
            groupId={row?.id}
            onRename={() => {
              if (!row) return;
              setEditingGroup(row.id);
              setGroupDraft(row.name);
            }}
            onRemove={() => row && void deleteGroup(row.id)}
            onMove={(direction) => void reorder(data.moveGroup(category, direction))}
          >
            {items.map((s) => {
              const info = statuses[s.id];
              return (
                <ServiceCard
                  key={s.id}
                  service={s}
                  status={info}
                  blocked={blockedIds.has(s.id)}
                  organizing={organizing}
                  confirmingRemoval={confirming === s.id}
                  dragging={dragging === s.id}
                  onEdit={() => openForm(s)}
                  onRemove={() => void remove(s)}
                  onCancelRemoval={() => setConfirming((c) => (c === s.id ? null : c))}
                  onMove={(direction) =>
                    void reorder(
                      data.placeService(
                        s,
                        sortedIn(s.category).findIndex((item) => item.id === s.id) + direction,
                      ),
                    )
                  }
                  dragProps={{
                    onDragStart: (event) => {
                      setDragging(s.id);
                      event.dataTransfer.effectAllowed = 'move';
                    },
                    onDragEnd: () => setDragging(null),
                    onDragOver: (event) => {
                      if (dragging !== null && dragging !== s.id) event.preventDefault();
                    },
                    onDrop: (event) => {
                      event.preventDefault();
                      const dragged = services.find((item) => item.id === dragging);
                      setDragging(null);
                      if (!dragged || dragged.category !== s.category) return;
                      void reorder(
                        data.placeService(
                          dragged,
                          sortedIn(s.category).findIndex((item) => item.id === s.id),
                        ),
                      );
                    },
                  }}
                />
              );
            })}
          </GroupSection>
        );
      })}
      {!groups.length && (
        <ServicesEmpty hasServices={services.length > 0} onAdd={() => openForm()} />
      )}
    </section>
  );
}
