import { t } from '@/i18n';
import { CircleCheck, Plus, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

type Props = {
  hasServices: boolean;
  onAdd: () => void;
  /** Filters that can be cleared: offers a way out of "no result". */
  onClearFilters?: () => void;
  /** The Offline view with nothing offline is good news, not an error. */
  calm?: boolean;
};

export function ServicesEmpty({ hasServices, onAdd, onClearFilters, calm }: Props) {
  if (calm)
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleCheck />
          </EmptyMedia>
          <EmptyTitle className="font-label text-xl">{t('empty.calm')}</EmptyTitle>
          <EmptyDescription>{t('empty.calmHint')}</EmptyDescription>
        </EmptyHeader>
        {onClearFilters && (
          <EmptyContent>
            <Button type="button" variant="outline" onClick={onClearFilters}>
              {t('empty.showAll')}
            </Button>
          </EmptyContent>
        )}
      </Empty>
    );
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">{hasServices ? <SearchX /> : <Plus />}</EmptyMedia>
        <EmptyTitle className="font-label text-xl">
          {hasServices ? t('empty.noneFound') : t('empty.title')}
        </EmptyTitle>
        <EmptyDescription>
          {hasServices ? t('empty.noneFoundHint') : t('empty.hint')}
        </EmptyDescription>
      </EmptyHeader>
      {hasServices && onClearFilters && (
        <EmptyContent>
          <Button type="button" variant="outline" onClick={onClearFilters}>
            {t('empty.clearFilters')}
          </Button>
        </EmptyContent>
      )}
      {!hasServices && (
        <EmptyContent>
          <Button type="button" onClick={onAdd}>
            <Plus />
            {t('empty.addFirst')}
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}
