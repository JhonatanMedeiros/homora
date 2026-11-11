import { t } from '@/i18n';
import { Plus, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

export function ServicesEmpty({ hasServices, onAdd }: { hasServices: boolean; onAdd: () => void }) {
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
