import { useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { Alert, AlertDescription } from '@homora/ui/alert';
import { Badge } from '@homora/ui/badge';
import { Button } from '@homora/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@homora/ui/dialog';
import { Input } from '@homora/ui/input';
import { Skeleton } from '@homora/ui/skeleton';
import { LoadingRegion } from '@/components/skeletons';
import { releaseUrl } from '@/hooks/use-build-version';
import { getLocale, t } from '@/i18n';
import { compareVersions, type Release } from './release-feed';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: 'loading' | 'ready' | 'error';
  releases: Release[];
  currentTag: string | null;
  demo?: boolean;
  retry: () => void;
};

/** Render a small, safe subset of release Markdown. Never interpret HTML or arbitrary links. */
function inline(text: string): ReactNode[] {
  const result: ReactNode[] = [];
  const pattern = /\[([^\]\n]{1,200})\]\(([^)\s]{1,500})\)/g;
  let start = 0,
    match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    result.push(text.slice(start, match.index).replace(/[`*]/g, ''));
    let safe = false;
    try {
      const url = new URL(match[2]);
      safe =
        url.protocol === 'https:' &&
        url.hostname === 'github.com' &&
        !url.username &&
        !url.password &&
        !url.port;
    } catch {
      /* Render text only. */
    }
    result.push(
      safe ? (
        <a
          key={match.index}
          href={match[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-4"
        >
          {match[1]}
        </a>
      ) : (
        match[1]
      ),
    );
    start = pattern.lastIndex;
  }
  result.push(text.slice(start).replace(/[`*]/g, ''));
  return result;
}
function Notes({ text }: { text: string }) {
  if (!text.trim()) return <p className="text-sm text-muted-foreground">{t('releases.noNotes')}</p>;
  return (
    <div className="flex flex-col gap-2 break-words text-sm leading-relaxed">
      {text
        .split('\n')
        .slice(0, 400)
        .map((line, index) => {
          const heading = /^#{1,4}\s+(.+)$/.exec(line);
          if (heading)
            return (
              <h3 key={index} className="mt-3 text-base font-semibold">
                {inline(heading[1])}
              </h3>
            );
          const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
          if (bullet)
            return (
              <ul key={index} className="list-disc pl-5">
                <li>{inline(bullet[1])}</li>
              </ul>
            );
          if (!line.trim() || /^---+$/.test(line.trim())) return null;
          return <p key={index}>{inline(line)}</p>;
        })}
    </div>
  );
}

export function ReleasesDialog({
  open,
  onOpenChange,
  status,
  releases,
  currentTag,
  demo = false,
  retry,
}: Props) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const normalized = query.trim().toLocaleLowerCase();
  const filtered = releases.filter((release) =>
    `${release.tag} ${release.title} ${release.body}`.toLocaleLowerCase().includes(normalized),
  );
  const index = Math.min(page, Math.max(0, filtered.length - 1));
  const current = filtered[index];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(85svh,48rem)] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('releases.title')}</DialogTitle>
          <DialogDescription>{t('releases.description')}</DialogDescription>
        </DialogHeader>
        {demo && (
          <Alert>
            <AlertDescription>{t('releases.demo')}</AlertDescription>
          </Alert>
        )}
        {status === 'loading' && (
          <LoadingRegion label={t('releases.loading')} className="flex flex-col gap-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-40 w-full" />
          </LoadingRegion>
        )}
        {status === 'error' && (
          <Alert>
            <AlertDescription>
              {t('releases.unavailable')}{' '}
              <Button variant="outline" size="sm" onClick={retry}>
                {t('releases.retry')}
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {status !== 'loading' && releases.length > 0 && (
          <Input
            aria-label={t('releases.search')}
            placeholder={t('releases.search')}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
          />
        )}
        {status === 'ready' && releases.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('releases.empty')}</p>
        )}
        {releases.length > 0 && !current && (
          <p className="text-sm text-muted-foreground">{t('releases.noResults')}</p>
        )}
        {current && (
          <div className="min-h-0 overflow-y-auto rounded-md border p-4">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {demo ? (
                <span className="font-semibold">{current.tag}</span>
              ) : (
                <a
                  className="inline-flex items-center gap-1 font-semibold underline-offset-4 hover:underline"
                  href={releaseUrl(current.tag)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {current.tag}
                  <ExternalLink className="size-3" />
                  <span className="sr-only"> {t('releases.github')}</span>
                </a>
              )}
              {!demo && currentTag && compareVersions(current.tag, currentTag) === 0 && (
                <Badge variant="secondary">{t('releases.current')}</Badge>
              )}
              <time className="text-xs text-muted-foreground" dateTime={current.date}>
                {t('releases.updated', {
                  date: new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium' }).format(
                    new Date(current.date),
                  ),
                })}
              </time>
            </div>
            <Notes text={current.body} />
            {current.truncated && (
              <p className="mt-4 text-xs text-muted-foreground">{t('releases.truncated')}</p>
            )}
          </div>
        )}
        {filtered.length > 1 && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {t('releases.page', { current: index + 1, total: filtered.length })}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={t('releases.previous')}
                disabled={index === 0}
                onClick={() => setPage(index - 1)}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={t('releases.next')}
                disabled={index >= filtered.length - 1}
                onClick={() => setPage(index + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
