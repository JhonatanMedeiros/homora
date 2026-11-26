import { useState } from 'react';
import type { Service } from '@homora/shared';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@homora/ui/alert-dialog';
import { t } from '@/i18n';
import { ServiceEditorDialog } from '@/components/service-editor-dialog';
import { dependsOn, type Dependency } from '@/features/hosts/dependencies';
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
    dirty,
    section,
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

  const [confirming, setConfirming] = useState(false);
  /** Closing asks first when something typed would be lost. */
  const requestClose = () => (dirty ? setConfirming(true) : closeForm());

  return (
    <>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('form.discard.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('form.discard.detail')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('form.discard.keep')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirming(false);
                closeForm();
              }}
            >
              {t('form.discard.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ServiceEditorDialog
        open={formOpen}
        saving={saving}
        editing={editing}
        nameRef={nameInput}
        onOpenChange={(open) => {
          if (!open && !saving) requestClose();
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
          onCancel: requestClose,
          others: services.filter((service) => service.id !== editing),
          initialSection: section,
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
    </>
  );
}
