import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Folder } from 'lucide-react';
import { t } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { NativeSelect } from '@/components/native-select';

type Props = {
  category: string;
  count: number;
  organizing: boolean;
  compact: boolean;
  searching: boolean;
  /** Presente só para grupos cadastrados (podem ser renomeados e removidos). */
  canEdit: boolean;
  canRemove: boolean;
  groupId?: number;
  /** Colunas escolhidas para o grupo; nulo ou ausente é o ajuste automático. */
  columns?: number | null;
  onColumns?: (columns: number | null) => void;
  onRename: () => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  children: ReactNode;
};

/** Classes completas (o Tailwind precisa vê-las): telas pequenas ficam em 1 ou 2 colunas. */
const COLUMN_CLASSES: Record<number, string> = {
  1: 'grid grid-cols-1 gap-3',
  2: 'grid grid-cols-1 gap-3 sm:grid-cols-2',
  3: 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4',
  5: 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5',
  6: 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6',
};

export function GroupSection({
  category,
  count,
  organizing,
  compact,
  searching,
  canEdit,
  canRemove,
  groupId,
  columns,
  onColumns,
  onRename,
  onRemove,
  onMove,
  children,
}: Props) {
  const titleId = `group:${category}`;
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('homora-collapsed-groups') ?? '[]').includes(category);
    } catch {
      return false;
    }
  });
  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      const current: unknown = JSON.parse(localStorage.getItem('homora-collapsed-groups') ?? '[]');
      const names = Array.isArray(current)
        ? current.filter((name): name is string => typeof name === 'string' && name !== category)
        : [];
      if (next) names.push(category);
      localStorage.setItem('homora-collapsed-groups', JSON.stringify(names));
    } catch {
      /* preferência apenas nesta sessão */
    }
  }
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <h2 id={titleId} className="flex min-w-0 items-center gap-2.5 text-lg font-semibold">
          <Folder aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className="break-words">{category}</span>
          <span className="font-mono text-xs font-normal text-muted-foreground tabular-nums">
            <span className="sr-only">{t('group.services')}</span>
            {count}
          </span>
        </h2>
        <Separator className="min-w-8 flex-1" />
        {!organizing && !searching && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t(collapsed ? 'group.expand' : 'group.collapse', { name: category })}
            aria-expanded={!collapsed || searching}
            aria-controls={`${titleId}:content`}
            onClick={toggleCollapsed}
          >
            <ChevronDown className={collapsed ? '-rotate-90' : ''} />
          </Button>
        )}
        {organizing && (
          <div className="flex flex-wrap items-center gap-1">
            {canEdit && onColumns && (
              <NativeSelect
                aria-label={t('group.columnsAria', { name: category })}
                className="h-8 w-auto text-sm"
                value={columns ?? ''}
                onChange={(event) =>
                  onColumns(event.target.value ? Number(event.target.value) : null)
                }
              >
                <option value="">{t('group.columnsAuto')}</option>
                {[1, 2, 3, 4, 5, 6].map((count) => (
                  <option key={count} value={count}>
                    {t('group.columnsCount', { count })}
                  </option>
                ))}
              </NativeSelect>
            )}
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
        )}
      </div>
      {(!collapsed || organizing || searching) && (
        <div id={`${titleId}:content`} className="flex flex-col gap-3">
          {count === 0 && <p className="text-sm text-muted-foreground">{t('group.empty')}</p>}
          <ul
            className={
              columns && COLUMN_CLASSES[columns]
                ? COLUMN_CLASSES[columns]
                : compact
                  ? 'grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                  : 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3'
            }
          >
            {children}
          </ul>
        </div>
      )}
    </section>
  );
}
