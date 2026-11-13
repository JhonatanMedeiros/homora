import { useCallback, useState, type FormEvent } from 'react';
import type { useServices } from '@/hooks/use-services';
import { apiError, t } from '@/i18n';

type ServicesData = ReturnType<typeof useServices>;

type Options = {
  data: ServicesData;
  activePageId: number;
  announce: (text: string) => void;
  onSaved: () => void;
};

export function useServiceGroups({ data, activePageId, announce, onSaved }: Options) {
  const { groupRows, pages, refresh } = data;
  const [editingGroup, setEditingGroup] = useState<number | null>(null);
  const [groupDraft, setGroupDraft] = useState('');
  const [groupError, setGroupError] = useState('');
  const [removingGroup, setRemovingGroup] = useState<{ id: number; name: string } | null>(null);

  const beginRename = useCallback((id: number, name: string) => {
    setEditingGroup(id);
    setGroupDraft(name);
  }, []);

  const cancelRename = useCallback(() => {
    if (editingGroup === null) return;
    const id = editingGroup;
    setEditingGroup(null);
    setGroupDraft('');
    document.querySelector<HTMLButtonElement>(`[data-group-edit="${id}"]`)?.focus();
  }, [editingGroup]);

  async function saveGroup(event: FormEvent) {
    event.preventDefault();
    setGroupError('');
    try {
      const response = await fetch(
        editingGroup === null ? '/api/groups' : `/api/groups/${editingGroup}`,
        {
          method: editingGroup === null ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: groupDraft,
            ...(editingGroup === null && pages.length > 1 && { pageId: activePageId }),
          }),
        },
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(body, t('error.saveGroup')));
      const wasEditing = editingGroup !== null;
      setEditingGroup(null);
      setGroupDraft('');
      onSaved();
      await refresh();
      announce(
        t(wasEditing ? 'group.saved' : 'group.added', {
          name: groupDraft.trim(),
        }),
      );
      if (wasEditing) document.querySelector<HTMLButtonElement>('[data-group-add]')?.focus();
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : t('error.saveGroup'));
    }
  }

  async function deleteGroup(id: number) {
    try {
      const name = groupRows.find((group) => group.id === id)?.name;
      const response = await fetch(`/api/groups/${id}`, { method: 'DELETE' });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(body, t('error.removeGroup')));
      await refresh();
      if (name) announce(t('group.removed', { name }));
      document.querySelector<HTMLButtonElement>('[data-group-add]')?.focus();
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : t('error.removeGroup'));
    }
  }

  return {
    editingGroup,
    beginRename,
    cancelRename,
    groupDraft,
    setGroupDraft,
    groupError,
    setGroupError,
    removingGroup,
    setRemovingGroup,
    saveGroup,
    deleteGroup,
  };
}
