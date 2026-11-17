import { Empty, EmptyDescription } from '@homora/ui/empty';

/** Compact empty state for lists inside a section. */
export function EmptyNote({ children }: { children: string }) {
  return (
    <Empty className="gap-2 border border-dashed p-4">
      <EmptyDescription>{children}</EmptyDescription>
    </Empty>
  );
}
