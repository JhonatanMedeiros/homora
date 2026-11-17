import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@homora/ui/dialog';
import { Kbd } from '@homora/ui/kbd';
import { t } from '@/i18n';
import { SHORTCUTS } from '@/lib/shortcuts';

/** Lists every keyboard shortcut. Opened with `?`. */
export function ShortcutsDialog({
  open,
  onOpenChange,
  singleKeysEnabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  singleKeysEnabled: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('shortcuts.title')}</DialogTitle>
          <DialogDescription>
            {singleKeysEnabled ? t('shortcuts.description') : t('shortcuts.descriptionOff')}
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col divide-y divide-border">
          {SHORTCUTS.map((shortcut) => {
            const inactive = !singleKeysEnabled && !shortcut.modifier;
            return (
              <li
                key={shortcut.label}
                className="flex items-center justify-between gap-4 py-2 text-sm data-[inactive=true]:opacity-50"
                data-inactive={inactive}
              >
                <span>{t(shortcut.label)}</span>
                <span className="flex items-center gap-1">
                  {shortcut.keys.map((key, index) => (
                    <span key={key} className="flex items-center gap-1">
                      {index > 0 && !shortcut.modifier && (
                        <span className="text-xs text-muted-foreground">{t('shortcuts.then')}</span>
                      )}
                      <Kbd>{key}</Kbd>
                    </span>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
