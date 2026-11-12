import type { ReactNode } from 'react';
import { SectionTitle } from '@/components/section-title';

/** A titled group of settings: rows separated by hairlines inside one bordered surface. */
export function SettingsGroup({
  id,
  title,
  actions,
  children,
}: {
  id: string;
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <SectionTitle id={id} actions={actions}>
        {title}
      </SectionTitle>
      <div className="flex flex-col divide-y divide-border rounded-lg border bg-card">
        {children}
      </div>
    </section>
  );
}

/** One setting: label and help on the left, the control on the right (stacked on phones). */
export function SettingRow({
  label,
  description,
  htmlFor,
  children,
}: {
  label: ReactNode;
  description?: ReactNode;
  /** Id of the control, when the label should name it. */
  htmlFor?: string;
  children: ReactNode;
}) {
  const Label = htmlFor ? 'label' : 'span';
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </Label>
        {description && <p className="max-w-[60ch] text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="flex shrink-0 items-center sm:max-w-[50%] sm:justify-end">{children}</div>
    </div>
  );
}
