import { toast } from 'sonner';
import { useEffect, useState } from 'react';
import { apiError, t } from '@/i18n';
import {
  overridesOf,
  type Evaluation,
  type ReviewEdits,
  type ReviewField,
  type ReviewItem,
  type ReviewResult,
} from '@/features/discovery/review-model';

const CHECK_DELAY_MS = 350;

/**
 * Review of selected Docker suggestions before anything is created. The server evaluates the
 * selection and edits without persisting (`preview`), and the confirmation sends back the version
 * and fingerprint it showed, so a source, configuration or label change in between is rejected.
 */
export function useDiscoveryReview({
  endpoint,
  extra,
  onDone,
}: {
  endpoint: string;
  /** Source-specific fields sent with every request, such as the reviewed inventory version. */
  extra: object;
  onDone: () => void | Promise<void>;
}) {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [edits, setEdits] = useState<ReviewEdits>({});
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [outcome, setOutcome] = useState<ReviewResult[] | null>(null);
  const [allowPrivate, setAllowPrivate] = useState(false);
  const [recheck, setRecheck] = useState(0);
  const extraKey = JSON.stringify(extra);

  useEffect(() => {
    if (!items || outcome) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            ids: items.map((item) => item.id),
            overrides: overridesOf(items, edits),
            preview: true,
            ...(JSON.parse(extraKey) as object),
          }),
        });
        const body: unknown = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (response.ok && body && typeof body === 'object') setEvaluation(body as Evaluation);
        else {
          setEvaluation(null);
          setNotice(apiError(body, t('discovery.reviewFailed')));
        }
      } catch {
        if (!controller.signal.aborted) {
          setEvaluation(null);
          setNotice(t('discovery.reviewFailed'));
        }
      }
    }, CHECK_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [endpoint, extraKey, items, edits, outcome, recheck]);

  function open(next: ReviewItem[]) {
    setItems(next);
    setEdits({});
    setEvaluation(null);
    setOutcome(null);
    setNotice('');
  }

  function close() {
    setItems(null);
    setEvaluation(null);
    setOutcome(null);
    setNotice('');
  }

  function edit(id: string, field: ReviewField, value: string) {
    setNotice('');
    setEvaluation(null);
    setEdits((current) => ({ ...current, [id]: { ...current[id], [field]: value } }));
  }

  /** True while the server has not yet evaluated the current selection and edits. */
  const checking = items !== null && outcome === null && evaluation === null && notice === '';

  /** Cards that would be created right now. */
  const creatable = evaluation?.results.filter((result) => result.status === 'created').length ?? 0;

  async function confirm() {
    if (!items || !evaluation || creatable === 0) return;
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: items.map((item) => item.id),
          overrides: overridesOf(items, edits),
          expectedVersion: evaluation.version,
          fingerprint: evaluation.fingerprint,
          ...(allowPrivate ? { keepPrivate: true } : {}),
          ...extra,
        }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const failure = apiError(body, t('discovery.reviewFailed'));
        setNotice(response.status === 409 ? `${failure} ${t('discovery.changed')}` : failure);
        toast.error(failure);
        setEvaluation(null);
        setRecheck((value) => value + 1);
        return;
      }
      const data = body as { created?: number; results?: ReviewResult[] };
      setOutcome(data.results ?? []);
      toast.success(t('discovery.added', { count: data.created ?? 0 }));
      await onDone();
    } catch {
      setNotice(t('discovery.reviewFailed'));
      toast.error(t('discovery.reviewFailed'));
    } finally {
      setBusy(false);
    }
  }

  return {
    items,
    edits,
    edit,
    evaluation,
    checking,
    busy,
    notice,
    outcome,
    creatable,
    allowPrivate,
    setAllowPrivate,
    open,
    close,
    confirm,
  };
}

export type DiscoveryReview = ReturnType<typeof useDiscoveryReview>;
