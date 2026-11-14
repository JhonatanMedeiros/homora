import type { Service } from '@homora/shared';
import { ServiceEditorDialog } from '@/components/service-editor-dialog';
import { dependsOn, type Dependency } from '@/lib/dependencies';
import { useServiceEditor } from '@/hooks/use-service-editor';

type Editor = ReturnType<typeof useServiceEditor>;

type Props = {
  editor: Editor;
  categories: string[];
  services: Service[];
  dependencies: Dependency[];
  onFocusEditTrigger: (id: number | null) => void;
};

/** Maps the service editor workflow to the shared form dialog and its host/dependency inputs. */
export function ServicePageEditor({
  editor,
  categories,
  services,
  dependencies,
  onFocusEditTrigger,
}: Props) {
  const {
    form,
    setForm,
    shared,
    setShared,
    monitoring,
    tags,
    links,
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
    closeForm,
    save,
    hostData,
  } = editor;

  return (
    <ServiceEditorDialog
      open={formOpen}
      saving={saving}
      editing={editing}
      nameRef={nameInput}
      onOpenChange={(open) => {
        if (!open && !saving) closeForm();
      }}
      onFocusEditTrigger={onFocusEditTrigger}
      formProps={{
        value: form,
        categories,
        error: formError,
        saving,
        isPublic: shared,
        onPublicChange: setShared,
        monitoring,
        tags,
        links,
        onChange: setForm,
        onSubmit: (event) => void save(event),
        onCancel: closeForm,
        hosts: {
          value: host,
          onChange: setHost,
          connections: hostData.connections,
          connectionsLoaded: hostData.connectionsLoaded,
          inventories: hostData.inventories,
          onReload: (id, refresh) => void hostData.reload(id, refresh),
        },
        dependencies: {
          selfId: editing,
          services,
          value: [
            ...(editing === null
              ? []
              : dependsOn(editing, dependencies).filter((id) => !depRemoved.includes(id))),
            ...depAdded,
          ],
          onChange: (next) => {
            const base = editing === null ? [] : dependsOn(editing, dependencies);
            setDepAdded(next.filter((id) => !base.includes(id)));
            setDepRemoved(base.filter((id) => !next.includes(id)));
          },
        },
      }}
    />
  );
}
