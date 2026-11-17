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
import { ResourceReviewDialog } from '@/components/resource-review-dialog';
import { HostSuggestionsPanel } from '@/features/hosts/host-suggestions-panel';
import type { CardResource } from '@/hooks/use-resource-links';
import { t } from '@/i18n';

type RemovingGroup = { id: number; name: string } | null;

type Props = {
  services: Service[];
  suggestionsOpen: boolean;
  onSuggestionsOpenChange: (open: boolean) => void;
  onRefresh: () => void | Promise<void>;
  onChooseHostManually: (service: Service) => void;
  resourceReviewId: number | null;
  resourceByService: Record<number, CardResource>;
  onCloseResource: () => void;
  onReloadResource: () => void;
  removingGroup: RemovingGroup;
  onRemovingGroupChange: (group: RemovingGroup) => void;
  onDeleteGroup: (id: number) => void | Promise<void>;
};

/** Dialogs and sheets opened from the services workspace. */
export function ServicePageOverlays({
  services,
  suggestionsOpen,
  onSuggestionsOpenChange,
  onRefresh,
  onChooseHostManually,
  resourceReviewId,
  resourceByService,
  onCloseResource,
  onReloadResource,
  removingGroup,
  onRemovingGroupChange,
  onDeleteGroup,
}: Props) {
  const resourceService = services.find((service) => service.id === resourceReviewId);
  const resourceInfo = resourceReviewId === null ? undefined : resourceByService[resourceReviewId];

  return (
    <>
      <HostSuggestionsPanel
        open={suggestionsOpen}
        onOpenChange={onSuggestionsOpenChange}
        services={services}
        onChanged={() => void onRefresh()}
        onChooseManually={onChooseHostManually}
      />
      {resourceService && resourceInfo && (
        <ResourceReviewDialog
          service={resourceService}
          info={resourceInfo}
          onClose={onCloseResource}
          onChanged={() => {
            void onRefresh();
            onReloadResource();
          }}
        />
      )}
      <AlertDialog
        open={removingGroup !== null}
        onOpenChange={(open) => !open && onRemovingGroupChange(null)}
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
              onClick={() => removingGroup && void onDeleteGroup(removingGroup.id)}
            >
              {t('common.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
