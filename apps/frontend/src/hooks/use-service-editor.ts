import { toast } from 'sonner';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  DEFAULT_MONITOR_SETTINGS,
  type HostLink,
  type MonitorSettings,
  type Service,
  type ServiceInput,
} from '@homora/shared';
import { useHostInventory } from '@/hooks/use-host-inventory';
import { useDependencies } from '@/hooks/use-dependencies';
import { useLinkTypes } from '@/hooks/use-link-types';
import type { useServices } from '@/hooks/use-services';
import { apiError, t } from '@/i18n';
import { emptyService } from '@/lib/services';
import { linkDrafts, linkInputs, sameLinks, type LinkDraft } from '@/lib/service-links';

type ServicesData = ReturnType<typeof useServices>;
type Dependencies = ReturnType<typeof useDependencies>;

function serviceDraft(service: Service | undefined, allowPrivateDefault: boolean): ServiceInput {
  return service
    ? {
        name: service.name,
        url: service.url,
        alias: service.alias ?? null,
        category: service.category,
        description: service.description,
        icon: service.icon ?? '',
        position: service.position ?? 0,
        allowPrivate: service.allowPrivate === true,
        checkInsecure: service.checkInsecure === true,
        openTarget: service.openTarget ?? 'new-tab',
        checkType: service.checkType ?? 'http',
        checkInterval: service.checkInterval ?? null,
        expectedStatus: service.expectedStatus ?? null,
        checkPath: service.checkPath ?? null,
        checkUrl: service.checkUrl ?? null,
        checkMatch: service.checkMatch ?? null,
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
  /** Alert settings and tags of every service, as the server reports them. */
  monitorSettings?: Record<number, MonitorSettings>;
  tagMap?: Record<number, string[]>;
  /** Called after the alert settings or the tags of a service were saved, so the page reloads them. */
  onMonitoringSaved?: () => void;
  onTagsSaved?: () => void;
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
  monitorSettings,
  tagMap = {},
  onMonitoringSaved,
  onTagsSaved,
}: Options) {
  const { services, refresh } = data;
  const [form, setForm] = useState<ServiceInput>(emptyService);
  const [shared, setShared] = useState(false);
  // Alert settings and tags live apart from the card. `null` means untouched, so the form shows
  // what the server reports (even when that arrives after the form opened) until a field changes.
  const [monitorDraft, setMonitorDraft] = useState<MonitorSettings | null>(null);
  const [tagDraft, setTagDraft] = useState<string[] | null>(null);
  // Extra addresses are saved with the card. The request carries them only when they differ from
  // what the form opened with, so an untouched list leaves the server's copy alone.
  const [linkDraft, setLinkDraft] = useState<LinkDraft[]>([]);
  const linkBase = useRef<LinkDraft[]>([]);
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
  const linkTypes = useLinkTypes(formOpen, () => void refresh());

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
    setMonitorDraft(null);
    setTagDraft(null);
    linkBase.current = linkDrafts(service?.links);
    setLinkDraft(linkBase.current);
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
    setMonitorDraft(null);
    setTagDraft(null);
    linkBase.current = linkDrafts(service?.links);
    setLinkDraft(linkBase.current);
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
          body: JSON.stringify({
            ...form,
            host,
            ...(sameLinks(linkDraft, linkBase.current) ? {} : { links: linkInputs(linkDraft) }),
          }),
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
        const before = (editing !== null && monitorSettings?.[editing]) || DEFAULT_MONITOR_SETTINGS;
        if (monitorDraft && JSON.stringify(before) !== JSON.stringify(monitorDraft)) {
          const alerts = await fetch(`/api/services/${savedId}/monitoring`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(monitorDraft),
          });
          if (!alerts.ok) throw new Error(t('error.saveMonitoring'));
          onMonitoringSaved?.();
        }
        if (tagDraft && JSON.stringify(tagDraft) !== JSON.stringify(tagMap[savedId] ?? [])) {
          const saved = await fetch(`/api/services/${savedId}/tags`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tags: tagDraft }),
          });
          if (!saved.ok) throw new Error(t('error.saveTags'));
          onTagsSaved?.();
        }
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
      const message = error instanceof Error && error.message ? error.message : t('error.save');
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return {
    form,
    setForm,
    shared,
    setShared,
    monitoring: {
      value:
        monitorDraft ??
        (editing === null ? undefined : monitorSettings?.[editing]) ??
        DEFAULT_MONITOR_SETTINGS,
      onChange: setMonitorDraft,
    },
    tags: {
      value: tagDraft ?? (editing === null ? [] : (tagMap[editing] ?? [])),
      onChange: setTagDraft,
    },
    links: {
      value: linkDraft,
      onChange: setLinkDraft,
      types: linkTypes,
    },
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
