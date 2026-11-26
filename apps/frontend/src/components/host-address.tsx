import { cn } from '@homora/ui/lib/utils';
import { hostOf } from '@/lib/services';

/** Host in mono that truncates in the middle: the port is what tells services on one box apart. */
export function HostAddress({ url, className }: { url: string; className?: string }) {
  const host = hostOf(url);
  const port = /:\d+(?=$|\/)/.exec(host);
  const head = port ? host.slice(0, port.index) : host;
  const tail = port ? host.slice(port.index) : '';
  return (
    <span
      title={host}
      className={cn('flex min-w-0 font-mono text-xs text-muted-foreground', className)}
    >
      <span className="truncate">{head}</span>
      {tail && <span className="shrink-0">{tail}</span>}
    </span>
  );
}
