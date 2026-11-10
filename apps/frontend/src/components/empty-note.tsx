import { Empty, EmptyDescription } from '@/components/ui/empty';

/** Estado vazio compacto para listas dentro de uma seção. */
export function EmptyNote({ children }: { children: string }) {
  return (
    <Empty className="gap-2 border border-dashed p-4">
      <EmptyDescription>{children}</EmptyDescription>
    </Empty>
  );
}
