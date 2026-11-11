import { marks, type Kind } from './connection-model';

/** Service badge/acronym; types outside the connection catalog use the first two letters. */
export function ConnectionMark({ type }: { type: string }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-10 shrink-0 place-items-center rounded-md bg-secondary font-label text-sm font-bold tracking-wide text-secondary-foreground"
    >
      {marks[type as Kind] ?? type.slice(0, 2).toUpperCase()}
    </span>
  );
}
