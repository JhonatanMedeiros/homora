import { useEffect, useState } from 'react';
import type { ServiceStatus } from '@/lib/services';

export type FailureCheck = Pick<ServiceStatus, 'status' | 'reason' | 'httpStatus' | 'latencyMs'> & {
  observedAt: number;
};
export type FailureDetails = {
  recent: FailureCheck[];
  failingSince: number | null;
  failingSinceIsApproximate: boolean;
  lastSuccess: { observedAt: number; latencyMs: number | null } | null;
};
export type FailureDetailsState = FailureDetails | 'loading' | 'error';

/** Loads recent status history when a service failure or its latest attempt changes. */
export function useServiceFailureDetails(serviceId: number, lastAttempt: string | null) {
  const [detail, setDetail] = useState<FailureDetailsState>('loading');
  useEffect(() => {
    let active = true;
    fetch(`/api/services/${serviceId}/status-detail`)
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<FailureDetails>;
      })
      .then((data) => active && setDetail(data))
      .catch(() => active && setDetail('error'));
    return () => {
      active = false;
    };
  }, [serviceId, lastAttempt]);
  return detail;
}
