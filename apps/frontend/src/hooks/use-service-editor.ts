import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { HostLink, Service, ServiceInput } from '@homora/shared';
import { useHostInventory } from '@/hooks/use-host-inventory';
import { useDependencies } from '@/hooks/use-dependencies';
import type { useServices } from '@/hooks/use-services';
import { apiError, t } from '@/i18n';
import { emptyService } from '@/lib/services';

type ServicesData = ReturnType<typeof useServices>;
type Dependencies = ReturnType<typeof useDependencies>;

function serviceDraft(service: Service | undefined, allowPrivateDefault: boolean): ServiceInput {
  return service
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
    : { ...emptyService, allowPrivate: allowPrivateDefault };
}

type Options = {
  managing: boolean;
  formRoute: 'new' | number | null;
  hostView: boolean;
  data: ServicesData;
  deps: Dependencies;
  navigate: (path: string, replace?: boolean) => void;
  announce: (text: string) => void;
  onOpenForm: () => void;
  onSaved: () => void;
};

export function useServiceEditor({
  managing,
  formRoute,
  hostView,
  data,
  deps,
  navigate,
  announce,
  onOpenForm,
  onSaved,
}: Options) {
  const { services, refresh } = data;
  const [form, setForm] = useState<ServiceInput>(emptyService);
  const [shared, setShared] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [host, setHost] = useState<HostLink | null>(null);
  // Dependency edits are applied with the card when the form is saved.
  const [depAdded, setDepAdded] = useState<number[]>([]);
  const [depRemoved, setDepRemoved] = useState<number[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const privateDefaultRef = useRef(false);
  const initializedRoute = useRef<'new' | number | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const linkedConnections = useMemo(
    () => [
      ...new Set(services.flatMap((service) => (service.host ? [service.host.connectionId] : []))),
    ],
    [services],
  );
  const hostData = useHostInventory(hostView || formOpen, linkedConnections);

  useEffect(() => {
    if (!managing) return;
    const controller = new AbortController();
    fetch('/api/service-defaults', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((result: { allowPrivate?: unknown } | null) => {
        const value = result?.allowPrivate === true;
        privateDefaultRef.current = value;
        // It can arrive after a "new service" form opened: seed it while the form is untouched.
        if (value && initializedRoute.current === 'new')
          setForm((current) =>
            current.name || current.url || current.allowPrivate
              ? current
              : { ...current, allowPrivate: true },
          );
      })
      .catch(() => {});
    return () => controller.abort();
  }, [managing]);

  function openForm(service?: Service) {
    onOpenForm();
    navigate(service ? `/manage/services/${service.id}/edit` : '/manage/services/new');
    setEditing(service?.id ?? null);
    setHost(service?.host ?? null);
    setDepAdded([]);
    setDepRemoved([]);
    setShared(service?.isPublic === true);
    setForm(serviceDraft(service, privateDefaultRef.current));
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
    setHost(service?.host ?? null);
    setDepAdded([]);
    setDepRemoved([]);
    setShared(service?.isPublic === true);
    setForm(serviceDraft(service, privateDefaultRef.current));
    setFormError('');
    setFormOpen(true);
  }, [formRoute, services]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const response = await fetch(
        editing === null ? '/api/services' : `/api/services/${editing}`,
        {
          method: editing === null ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, host }),
        },
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(body, t('error.save')));
      const savedId = editing ?? (body as { id?: number } | null)?.id;
      const wasShared =
        editing !== null && services.find((service) => service.id === editing)?.isPublic === true;
      if (savedId !== undefined && shared !== wasShared) {
        const visibility = await fetch(`/api/services/${savedId}/public`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isPublic: shared }),
        });
        if (!visibility.ok) throw new Error(t('error.savePublic'));
      }
      if (savedId !== undefined) {
        for (const id of depAdded) {
          const failure = await deps.add(savedId, id);
          if (failure) throw new Error(failure);
        }
        for (const id of depRemoved) {
          const failure = await deps.remove(savedId, id);
          if (failure) throw new Error(failure);
        }
      }
      const wasNew = editing === null;
      closeForm();
      onSaved();
      await refresh();
      announce(wasNew ? t('page.added') : t('page.saved'));
    } catch (error) {
      setFormError(error instanceof Error && error.message ? error.message : t('error.save'));
    } finally {
      setSaving(false);
    }
  }

  return {
    form,
    setForm,
    shared,
    setShared,
    formOpen,
    host,
    setHost,
    depAdded,
    depRemoved,
    setDepAdded,
    setDepRemoved,
    editing,
    formError,
    saving,
    nameInput,
    openForm,
    closeForm,
    save,
    hostData,
  };
}
