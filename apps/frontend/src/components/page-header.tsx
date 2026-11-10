import type { ReactNode } from 'react';

type Props = { title: string; description?: ReactNode; actions?: ReactNode };

export function PageHeader({ title, description, actions }: Props) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-3xl leading-tight">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-[65ch] text-base text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
