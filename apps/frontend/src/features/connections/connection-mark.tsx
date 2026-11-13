import { marks, type Kind } from './connection-model';
import { integrationDefinition } from '@homora/integrations';

/** Service badge/acronym; types outside the connection catalog use the first two letters. */
export function ConnectionMark({ type }: { type: string }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-10 shrink-0 place-items-center rounded-md bg-secondary p-2 text-secondary-foreground"
    >
      <img
        src={`/brand-icons/${integrationDefinition(type)?.brandIcon ?? type}.svg`}
        alt=""
        className="size-full object-contain"
        onError={(event) => {
          event.currentTarget.hidden = true;
          const fallback = event.currentTarget.nextElementSibling;
          if (fallback instanceof HTMLElement) fallback.hidden = false;
        }}
      />
      <span hidden className="font-mono text-xs font-semibold">
        {marks[type as Kind] ?? type.slice(0, 2).toUpperCase()}
      </span>
    </span>
  );
}
