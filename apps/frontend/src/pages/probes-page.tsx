import { useState } from 'react';
import type { Probe } from '@homora/shared';
import { Plus, Radar } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { FormError } from '@/components/form-error';
import { PageHeader } from '@/components/page-header';
import { SectionSkeleton } from '@/components/skeletons';
import { StatusLight } from '@/components/status-light';
import { ProbeDialog } from '@/features/probes/probe-dialog';
import { draftOf, probeTemplates, type ProbeDraft } from '@/features/probes/probe-model';
import { useProbes } from '@/hooks/use-probes';
import { useUptime } from '@/hooks/use-uptime';
import { t } from '@/i18n';
import { isPrivateHost } from '@/lib/services';
import { describeStatus } from '@/lib/status-text';

/** Manage › Probes: what Homora checks without a card on the Home. */
export function ProbesPage() {
  const { probes, statuses, failed, save, remove } = useProbes();
  const uptime = useUptime('24h');
  const [draft, setDraft] = useState<ProbeDraft | null>(null);
  const [deleting, setDeleting] = useState<Probe | null>(null);

  async function confirmDelete() {
    if (!deleting) return;
    const ok = await remove(deleting.id);
    setDeleting(null);
    if (ok) toast.success(t('probes.deleted'));
    else toast.error(t('probes.deleteFailed'));
  }

  const add = (
    <Button onClick={() => setDraft({ name: '', address: '', checkType: 'ping' })}>
      <Plus />
      {t('probes.add')}
    </Button>
  );

  return (
    <section aria-label={t('probes.title')} className="flex flex-col gap-6">
      <PageHeader
        title={t('probes.title')}
        description={t('probes.description')}
        actions={probes && probes.length > 0 ? add : undefined}
      />
      <FormError>{failed ? t('probes.loadFailed') : ''}</FormError>
      {probes === null ? (
        !failed && <SectionSkeleton label={t('common.loading')} />
      ) : probes.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Radar />
            </EmptyMedia>
            <EmptyTitle>{t('probes.empty.title')}</EmptyTitle>
            <EmptyDescription>{t('probes.empty.description')}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex flex-wrap justify-center gap-2">
              {probeTemplates.map((template) => (
                <Button
                  key={template.id}
                  variant="outline"
                  onClick={() =>
                    setDraft({ ...template.draft, name: t(`probes.template.${template.id}.name`) })
                  }
                >
                  {t(`probes.template.${template.id}`)}
                </Button>
              ))}
            </div>
            {add}
          </EmptyContent>
        </Empty>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border bg-card">
          {probes.map((probe) => {
            const blocked = !probe.allowPrivate && isPrivateHost(probe.address);
            const view = describeStatus(statuses[probe.id], blocked, {
              checkType: probe.checkType,
            });
            const summary = uptime[probe.id];
            return (
              <li
                key={probe.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4"
                data-probe={probe.id}
              >
                <StatusLight state={view.state} blocked={view.blocked} label={view.label} />
                <div className="min-w-0 flex-1 basis-48">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{probe.name}</span>
                    <Badge variant="secondary">{t(`check.type.${probe.checkType}`)}</Badge>
                    {probe.isPublic && <Badge variant="outline">{t('probes.shared')}</Badge>}
                  </div>
                  <p className="truncate font-mono text-sm text-muted-foreground">
                    {probe.address}
                  </p>
                  {view.note && <p className="text-sm text-muted-foreground">{view.note}</p>}
                </div>
                {summary && typeof summary.uptimePct === 'number' && (
                  <span className="font-mono text-sm text-muted-foreground tabular-nums">
                    {t('probes.uptime24h', { value: `${summary.uptimePct}%` })}
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={t('probes.edit', { name: probe.name })}
                    onClick={() => setDraft(draftOf(probe))}
                  >
                    {t('common.edit')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={t('probes.remove', { name: probe.name })}
                    onClick={() => setDeleting(probe)}
                  >
                    {t('common.remove')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <ProbeDialog draft={draft} onOpenChange={(open) => !open && setDraft(null)} onSave={save} />
      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('probes.delete.title', { name: deleting?.name ?? '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('probes.delete.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void confirmDelete()}>
              {t('common.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
