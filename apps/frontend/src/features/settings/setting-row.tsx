import type { ReactNode } from 'react';

/** A titled group of settings: a header, then rows separated by hairlines, all in one bordered card. */
export function SettingsGroup({
  id,
  title,
  hint,
  actions,
  children,
}: {
  id: string;
  title: ReactNode;
  /** Short note beside the title, such as where the settings are saved. */
  hint?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col divide-y divide-border rounded-lg border bg-card"
    >
      <div className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
        <h2 id={id} className="text-base font-semibold">
          {title}
        </h2>
        {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>
      {children}
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
