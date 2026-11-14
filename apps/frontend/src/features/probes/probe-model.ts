import type { Probe, ProbeInput } from '@homora/shared';

/** What the dialog starts from: a stored probe, an example, or nothing. */
export type ProbeDraft = ProbeInput & { id?: number; isPublic?: boolean };

export const probeTemplates: { id: 'wan' | 'dns' | 'tcp'; draft: ProbeInput }[] = [
  { id: 'wan', draft: { name: '', address: 'http://1.1.1.1', checkType: 'ping' } },
  {
    id: 'dns',
    draft: { name: '', address: 'http://router.lan', checkType: 'dns', allowPrivate: true },
  },
  {
    id: 'tcp',
    draft: { name: '', address: 'http://nas.lan:22', checkType: 'tcp', allowPrivate: true },
  },
];

/** The form starts from the stored probe as it is. */
export const draftOf = (probe: Probe): ProbeDraft => probe;
