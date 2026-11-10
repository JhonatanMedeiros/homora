import { CircleAlert, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { t, type MessageKey } from '@/i18n';
import type { Plan } from './transfer-model';

/** Relatório de uma importação: o que entra, o que já existe e o que foi ignorado. */
export function ImportPreview({ plan }: { plan: Plan }) {
  const { summary } = plan;
  return (
    <div className="flex flex-col gap-4" aria-label={t('transfer.previewTitle')} role="group">
      <p className="text-sm font-medium">
        {t('transfer.summary', {
          groups: t('transfer.groupsCount', { count: summary.newGroups }),
          services: t('transfer.servicesCount', { count: summary.newServices }),
          duplicates: t('transfer.duplicatesCount', { count: summary.duplicates }),
        })}
      </p>
      {plan.services.length > 0 && (
        <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-md border p-2 text-sm">
          {plan.services.map((service, index) => (
            <li
              key={`${service.group}:${service.url}:${index}`}
              className="flex flex-wrap items-center justify-between gap-2 px-1 py-0.5"
            >
              <span className="min-w-0 break-words">
                <b className="font-semibold">{service.name}</b>{' '}
                <span className="text-muted-foreground">· {service.group}</span>
              </span>
              <Badge variant={service.status === 'new' ? 'success' : 'secondary'}>
                {service.status === 'new' ? t('transfer.statusNew') : t('transfer.statusDuplicate')}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      {plan.issues.length > 0 && (
        <section aria-label={t('transfer.issues')} className="flex flex-col gap-2">
          <h3 className="font-label text-base">{t('transfer.issues')}</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {plan.issues.map((issue, index) => {
              const Icon = issue.severity === 'error' ? CircleAlert : TriangleAlert;
              return (
                <li key={`${issue.path}:${issue.code}:${index}`} className="flex items-start gap-2">
                  <Icon
                    aria-hidden="true"
                    className={
                      issue.severity === 'error'
                        ? 'mt-0.5 size-4 shrink-0 text-destructive'
                        : 'mt-0.5 size-4 shrink-0 text-muted-foreground'
                    }
                  />
                  <span>
                    {t(`transfer.issue.${issue.code}` as MessageKey)}
                    {issue.path && (
                      <small className="block font-mono text-xs text-muted-foreground">
                        {t('transfer.issuePath', { path: issue.path })}
                      </small>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
