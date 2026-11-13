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
} from '@/components/ui/alert-dialog';
import { CoolifyReviewDialog } from '@/components/coolify-review-dialog';
import { HostSuggestionsPanel } from '@/components/host-suggestions-panel';
import type { CardCoolify } from '@/hooks/use-resource-links';
import { t } from '@/i18n';

type RemovingGroup = { id: number; name: string } | null;

type Props = {
  services: Service[];
  suggestionsOpen: boolean;
  onSuggestionsOpenChange: (open: boolean) => void;
  onRefresh: () => void | Promise<void>;
  onChooseHostManually: (service: Service) => void;
  coolifyReviewId: number | null;
  coolifyByService: Record<number, CardCoolify>;
  onCloseCoolify: () => void;
  onReloadCoolify: () => void;
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
  coolifyReviewId,
  coolifyByService,
  onCloseCoolify,
  onReloadCoolify,
  removingGroup,
  onRemovingGroupChange,
  onDeleteGroup,
}: Props) {
  const coolifyService = services.find((service) => service.id === coolifyReviewId);
  const coolifyInfo = coolifyReviewId === null ? undefined : coolifyByService[coolifyReviewId];

  return (
    <>
      <HostSuggestionsPanel
        open={suggestionsOpen}
        onOpenChange={onSuggestionsOpenChange}
        services={services}
        onChanged={() => void onRefresh()}
        onChooseManually={onChooseHostManually}
      />
      {coolifyService && coolifyInfo && (
        <CoolifyReviewDialog
          service={coolifyService}
          info={coolifyInfo}
          onClose={onCloseCoolify}
          onChanged={() => {
            void onRefresh();
            onReloadCoolify();
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
