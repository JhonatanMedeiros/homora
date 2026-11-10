import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionTitle } from '@/components/section-title';
import { t } from '@/i18n';

type Props = {
  category: string;
  count: number;
  organizing: boolean;
  /** Presente só para grupos cadastrados (podem ser renomeados e removidos). */
  canEdit: boolean;
  canRemove: boolean;
  groupId?: number;
  onRename: () => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  children: ReactNode;
};

export function GroupSection({
  category,
  count,
  organizing,
  canEdit,
  canRemove,
  groupId,
  onRename,
  onRemove,
  onMove,
  children,
}: Props) {
  const titleId = `group:${category}`;
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <SectionTitle
        id={titleId}
        count={count}
        actions={
          organizing && (
            <div className="flex flex-wrap items-center gap-1">
              {canEdit && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    data-group-edit={groupId}
                    aria-label={t('group.renameAria', { name: category })}
                    onClick={onRename}
                  >
                    {t('common.rename')}
                  </Button>
                  {canRemove && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      aria-label={t('group.removeAria', { name: category })}
                      onClick={onRemove}
                    >
                      {t('common.remove')}
                    </Button>
                  )}
                </>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('group.moveUp', { name: category })}
                onClick={() => onMove(-1)}
              >
                <ArrowUp />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('group.moveDown', { name: category })}
                onClick={() => onMove(1)}
              >
                <ArrowDown />
              </Button>
            </div>
          )
        }
      >
        {category}
      </SectionTitle>
      {count === 0 && <p className="text-sm text-muted-foreground">{t('group.empty')}</p>}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</ul>
    </section>
  );
}
