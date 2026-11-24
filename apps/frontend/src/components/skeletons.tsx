import type { ReactNode } from 'react';
import { Skeleton as BaseSkeleton } from '@homora/ui/skeleton';
import { cn } from '@homora/ui/lib/utils';

/** The shadcn skeleton, but still for people who ask the system to reduce motion. */
function Bone({ className, ...props }: React.ComponentProps<'div'>) {
  return <BaseSkeleton className={cn('motion-reduce:animate-none', className)} {...props} />;
}

/**
 * Announces a loading area once to assistive technology and hides the placeholder shapes,
 * which carry no information. `label` is the same text the old spinner showed.
 */
export function LoadingRegion({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="contents">
        {children}
      </div>
    </div>
  );
}

const COLUMNS = 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3';

/** Mirrors ServiceCard: icon, title and host, uptime strip, status footer. */
function ServiceCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <Bone className="size-10 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
          <Bone className="h-4 w-2/5" />
          <Bone className="h-3 w-3/5" />
        </div>
      </div>
      <Bone className="h-6 w-full" />
      <div className="flex items-center justify-between border-t pt-3">
        <Bone className="h-3 w-20" />
        <Bone className="h-3 w-12" />
      </div>
    </div>
  );
}

/** Mirrors the compact service row used by the list view. */
function ServiceRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2">
      <Bone className="size-8 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Bone className="h-3.5 w-1/3" />
        <Bone className="h-3 w-1/4" />
      </div>
      <Bone className="h-3 w-16" />
    </div>
  );
}

/** Home / management view while the service list loads: summary line plus two groups. */
export function ServicesSkeleton({ label, list = false }: { label: string; list?: boolean }) {
  return (
    <LoadingRegion label={label} className="flex flex-col gap-8">
      {[3, 3].map((count, group) => (
        <div key={group} className="flex flex-col gap-3">
          <Bone className="h-4 w-28" />
          <div className={list ? 'grid grid-cols-1 gap-1.5' : COLUMNS}>
            {Array.from({ length: count }, (_, index) =>
              list ? <ServiceRowSkeleton key={index} /> : <ServiceCardSkeleton key={index} />,
            )}
          </div>
        </div>
      ))}
    </LoadingRegion>
  );
}

/** Generic bordered rows (connections, proposals, channels): media, two text lines, action. */
export function RowListSkeleton({
  label,
  rows = 3,
  className,
}: {
  label: string;
  rows?: number;
  className?: string;
}) {
  return (
    <LoadingRegion label={label} className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-lg border bg-card p-4">
          <Bone className="size-9 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Bone className="h-4 w-1/3" />
            <Bone className="h-3 w-1/2" />
          </div>
          <Bone className="size-8 shrink-0" />
        </div>
      ))}
    </LoadingRegion>
  );
}

/** Grid of connection cards: media, name and address, then a status line. */
export function CardGridSkeleton({
  label,
  cards = 3,
  className,
}: {
  label: string;
  cards?: number;
  className?: string;
}) {
  return (
    <LoadingRegion
      label={label}
      className={cn('grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3', className)}
    >
      {Array.from({ length: cards }, (_, index) => (
        <div key={index} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          <div className="flex items-center gap-3">
            <Bone className="size-10 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Bone className="h-4 w-1/2" />
              <Bone className="h-3 w-2/3" />
            </div>
          </div>
          <Bone className="h-3 w-1/3" />
        </div>
      ))}
    </LoadingRegion>
  );
}

/** Activity feed: a day heading followed by a bordered list of events. */
export function ActivitySkeleton({ label }: { label: string }) {
  return (
    <LoadingRegion label={label} className="flex flex-col gap-3">
      <Bone className="h-4 w-24" />
      <div className="divide-y overflow-hidden rounded-lg border bg-card">
        {Array.from({ length: 5 }, (_, index) => (
          <div
            key={index}
            className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-4"
          >
            <Bone className="h-4 w-28 md:w-40 md:shrink-0" />
            <Bone className="h-4 w-full max-w-sm" />
            <Bone className="h-3 w-24 md:ml-auto" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

/** Settings blocks (notification channels, discovery): heading, text and a form-like body. */
export function SectionSkeleton({ label, className }: { label: string; className?: string }) {
  return (
    <LoadingRegion label={label} className={cn('flex flex-col gap-3', className)}>
      <Bone className="h-4 w-40" />
      <Bone className="h-3 w-3/4 max-w-md" />
      <Bone className="h-16 w-full" />
    </LoadingRegion>
  );
}

/** Public status page: overall summary line, then a category of services with uptime bars. */
export function PublicStatusSkeleton({ label }: { label: string }) {
  return (
    <LoadingRegion label={label} className="flex flex-col gap-8">
      <Bone className="h-6 w-56" />
      <div className="flex flex-col gap-3">
        <Bone className="h-4 w-24" />
        <div className="flex flex-col divide-y divide-border rounded-lg border">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex flex-col gap-2 p-4">
              <div className="flex items-center justify-between gap-4">
                <Bone className="h-4 w-1/3" />
                <Bone className="h-3 w-24" />
              </div>
              <Bone className="h-5 w-full" />
            </div>
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}

/**
 * Integration data inside a service card. Mirrors the ready state in CardWidgets: a wrapping
 * row of inline "label value" pairs, each one text-sm line tall, so the card does not change
 * height when the data arrives in the card, compact and list layouts.
 */
export function WidgetSkeleton({ label, count = 3 }: { label: string; count?: number }) {
  return (
    <LoadingRegion
      label={label}
      className="flex w-full min-w-0 flex-wrap items-center gap-x-4 gap-y-1"
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex h-5 min-w-0 items-center gap-1.5">
          <Bone className="h-3 w-7 shrink-0" />
          <Bone className="h-4 w-9" />
        </div>
      ))}
    </LoadingRegion>
  );
}

/** Top bar telemetry (CPU, memory, disk) while the first sample is in flight. */
export function SystemStatsSkeleton({ label }: { label: string }) {
  return (
    <LoadingRegion label={label} className="flex flex-wrap gap-x-5 gap-y-1">
      {[0, 1, 2].map((index) => (
        <Bone key={index} className="h-4 w-16" />
      ))}
    </LoadingRegion>
  );
}

/** Failure details panel inside an expanded card. */
export function DetailsSkeleton({ label, className }: { label: string; className?: string }) {
  return (
    <LoadingRegion label={label} className={cn('flex flex-col gap-2', className)}>
      <Bone className="h-4 w-2/3" />
      <Bone className="h-4 w-1/2" />
      <Bone className="h-5 w-full" />
    </LoadingRegion>
  );
}
