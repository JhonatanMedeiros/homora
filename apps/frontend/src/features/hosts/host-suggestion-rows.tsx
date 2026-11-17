import type { Service } from '@homora/shared';
import { CircleCheck, CircleHelp } from 'lucide-react';
import { Badge } from '@homora/ui/badge';
import { Button } from '@homora/ui/button';
import { Checkbox } from '@homora/ui/checkbox';
import type {
  CardSuggestion,
  SuggestionCandidate,
  SuggestionEvidence,
  SuggestionDecision,
} from '@/features/hosts/host-suggestion-model';
import { t } from '@/i18n';

const evidenceText = (item: SuggestionEvidence) =>
  t(`hosts.evidence.${item.kind}`, { address: item.address ?? '' });

export function HostSuggestionCandidateRow({
  item,
  service,
  selected,
  decision,
  busy,
  onSelect,
  onAccept,
  onDismiss,
  onUndo,
  onChooseManually,
}: {
  item: CardSuggestion;
  service?: Service;
  selected: boolean;
  decision?: SuggestionDecision;
  busy: boolean;
  onSelect: (selected: boolean) => void;
  onAccept: (candidate: SuggestionCandidate) => void;
  onDismiss: (candidate: SuggestionCandidate) => void;
  onUndo: () => void;
  onChooseManually: (service: Service) => void;
}) {
  const best = item.candidates[0]!;
  const guest = best.name || String(best.host.vmid);

  return (
    <li className="flex flex-col gap-2 rounded-lg border bg-card p-3">
      <div className="flex items-start gap-3">
        {!decision && (
          <Checkbox
            aria-label={t('hosts.suggest.select', { name: service?.name ?? '' })}
            checked={selected}
            className="mt-1 pointer-coarse:size-6"
            onCheckedChange={(checked) => onSelect(checked === true)}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {service?.name ?? ''}
            <span className="text-muted-foreground">→</span>
            <span>{guest}</span>
            <small className="font-mono font-normal text-muted-foreground">
              {best.host.vmid} · {best.host.node}
            </small>
            <Badge variant={best.strength === 'strong' ? 'default' : 'secondary'}>
              <CircleCheck aria-hidden="true" />
              {t(`hosts.strength.${best.strength}`)}
            </Badge>
          </p>
          <ul className="list-disc pl-5 text-xs text-muted-foreground">
            {best.evidence.map((evidence) => (
              <li key={evidence.kind}>{evidenceText(evidence)}</li>
            ))}
          </ul>
          {best.ambiguous && <p className="text-xs font-medium">{t('hosts.suggest.ambiguous')}</p>}
        </div>
      </div>
      {decision ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span role="status">
            {decision.kind === 'accepted'
              ? t('hosts.suggest.accepted', { guest })
              : t('hosts.suggest.dismissed', { guest })}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="pointer-coarse:h-11"
            disabled={busy}
            onClick={onUndo}
          >
            {t('hosts.suggest.undo')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            className="pointer-coarse:h-11"
            disabled={busy}
            onClick={() => onAccept(best)}
          >
            {t('hosts.suggest.accept')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="pointer-coarse:h-11"
            disabled={busy}
            onClick={() => onDismiss(best)}
          >
            {t('hosts.suggest.dismiss')}
          </Button>
          {service && item.candidates.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="pointer-coarse:h-11"
              onClick={() => onChooseManually(service)}
            >
              {t('hosts.suggest.manual')}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

export function HostSuggestionManualRow({
  service,
  onChooseManually,
}: {
  service: Service;
  onChooseManually: (service: Service) => void;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
        {service.name}
        <Badge variant="outline">
          <CircleHelp aria-hidden="true" />
          {t('hosts.suggest.noEvidence')}
        </Badge>
      </p>
      <p className="text-xs text-muted-foreground">{t('hosts.suggest.noEvidenceHint')}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit pointer-coarse:h-11"
        onClick={() => onChooseManually(service)}
      >
        {t('hosts.suggest.manual')}
      </Button>
    </li>
  );
}
