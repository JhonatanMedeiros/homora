import { useEffect, useRef, useState, type FormEvent, type MutableRefObject } from 'react';
import type { Service, ServiceInput } from '@homora/shared';
import { Check, Plus, SlidersHorizontal } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
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

const collator = 'pt-BR';

/** Tela principal: grupos de serviços com estado, busca, edição e modo Organizar. */
type Props = {
  query: string;
  managing: boolean;
  onManage: () => void;
  data: ReturnType<typeof useServices>;
  /** A busca abre o primeiro resultado com Enter; a página registra aqui como fazê-lo. */
  openFirstRef: MutableRefObject<(() => void) | null>;
};

export function ServicesPage({ query, data, openFirstRef, managing, onManage }: Props) {
  const { services, groupRows, statuses, categories, sortedIn, blockedIds, refresh } = data;
  const [compact, setCompact] = useState(() => {
    try {
      return localStorage.getItem('homora-density') === 'compact';
    } catch {
      return false;
    }
  });
  const [showDescriptions, setShowDescriptions] = useState(() => {
    try {
      return localStorage.getItem('homora-descriptions') !== 'hidden';
    } catch {
      return true;
    }
  });
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
  const nameInput = useRef<HTMLInputElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);

  useEffect(() => () => window.clearTimeout(flashTimer.current), []);
  function announce(text: string) {
    setFlash(text);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(''), 5000);
  }

  const needle = query.toLocaleLowerCase(collator).trim();
  const filtered = services.filter(
    (s) =>
      (selected === null || s.category === selected) &&
      `${s.name} ${s.category} ${s.description} ${s.url}`
        .toLocaleLowerCase(collator)
        .includes(needle),
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
  }
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
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw Error(body.error);
      const wasNew = editing === null;
      closeForm();
      setSelected(null);
      await refresh();
      announce(wasNew ? 'Serviço adicionado.' : 'Alterações salvas.');
    } catch (e) {
      setFormError(e instanceof Error && e.message ? e.message : 'Não foi possível salvar.');
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
      announce('Serviço removido.');
    } catch {
      setMessage('Não foi possível remover o serviço.');
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
      if (!response.ok) throw Error(body.error || 'Não foi possível salvar o grupo.');
      const wasEditing = editingGroup !== null;
      setEditingGroup(null);
      setGroupDraft('');
      setSelected(null);
      await refresh();
      if (wasEditing) document.querySelector<HTMLButtonElement>('[data-group-add]')?.focus();
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : 'Não foi possível salvar o grupo.');
    }
  }
  async function deleteGroup(id: number) {
    try {
      const response = await fetch(`/api/groups/${id}`, { method: 'DELETE' });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw Error(body.error || 'Não foi possível remover o grupo.');
      await refresh();
      document.querySelector<HTMLButtonElement>('[data-group-add]')?.focus();
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : 'Não foi possível remover o grupo.');
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
  const unknown = total - online - down - blocked;
  return (
    <section aria-label="Serviços" className="flex flex-col gap-6">
      {managing && (
        <PageHeader
          title="Serviços e grupos"
          description={
            total
              ? `${total} ${total === 1 ? 'serviço' : 'serviços'} em ${categories.length} ${categories.length === 1 ? 'grupo' : 'grupos'}. Adicione ou edite serviços e organize os grupos.`
              : 'Reúna aqui os serviços da sua casa e abra qualquer um com um clique.'
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
                {organizing ? 'Concluir' : 'Organizar'}
              </Button>
              <Button ref={addButton} type="button" onClick={() => openForm()}>
                <Plus />
                Adicionar serviço
              </Button>
            </>
          }
        />
      )}
      {!managing && !organizing && (
        <HealthSummary online={online} down={down} blocked={blocked} unknown={unknown} />
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
              {editing !== null ? 'Editar serviço' : 'Novo serviço'}
            </DialogTitle>
            <DialogDescription>
              Preencha os dados para organizar e acessar o serviço no painel.
            </DialogDescription>
          </DialogHeader>
          <ServiceForm
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
        </DialogContent>
      </Dialog>
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
      {!managing && services.length > 0 && (
        <div className="flex items-center justify-end gap-3">
          <span className="text-sm text-muted-foreground">Visualização</span>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={compact ? 'compact' : 'comfortable'}
            onValueChange={(value) => {
              if (!value) return;
              const next = value === 'compact';
              setCompact(next);
              try {
                localStorage.setItem('homora-density', next ? 'compact' : 'comfortable');
              } catch {
                /* preferência apenas nesta sessão */
              }
            }}
            aria-label="Densidade dos serviços"
          >
            <ToggleGroupItem value="comfortable">Confortável</ToggleGroupItem>
            <ToggleGroupItem value="compact">Compacta</ToggleGroupItem>
          </ToggleGroup>
          <Button
            variant="outline"
            size="sm"
            aria-pressed={showDescriptions}
            onClick={() => {
              const next = !showDescriptions;
              setShowDescriptions(next);
              try {
                localStorage.setItem('homora-descriptions', next ? 'visible' : 'hidden');
              } catch {
                /* preferência apenas nesta sessão */
              }
            }}
          >
            {showDescriptions ? 'Ocultar descrições' : 'Mostrar descrições'}
          </Button>
        </div>
      )}
      {groups.map(({ category, items }) => {
        const row = groupRows.find((group) => group.name === category);
        return (
          <GroupSection
            key={category}
            category={category}
            count={items.length}
            organizing={organizing}
            compact={compact && !managing}
            searching={Boolean(needle)}
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
                  managing={managing}
                  compact={compact && !managing}
                  showDescription={showDescriptions || managing}
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
        <ServicesEmpty
          hasServices={services.length > 0}
          managing={managing}
          onAdd={() => (managing ? openForm() : onManage())}
        />
      )}
    </section>
  );
}
