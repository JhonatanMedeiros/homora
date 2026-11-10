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

export function ServicesEmpty({
  hasServices,
  onAdd,
  managing,
}: {
  hasServices: boolean;
  onAdd: () => void;
  managing: boolean;
}) {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">{hasServices ? <SearchX /> : <Plus />}</EmptyMedia>
        <EmptyTitle className="font-label text-xl">
          {hasServices ? 'Nenhum serviço encontrado' : 'Seu painel está vazio'}
        </EmptyTitle>
        <EmptyDescription>
          {hasServices
            ? 'Experimente outro termo ou escolha “Todos”.'
            : 'Comece pelo serviço que você mais abre. Depois é só ir juntando o resto.'}
        </EmptyDescription>
      </EmptyHeader>
      {!hasServices && (
        <EmptyContent>
          <Button type="button" onClick={onAdd}>
            <Plus />
            {managing ? 'Adicionar primeiro serviço' : 'Gerenciar serviços'}
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}
