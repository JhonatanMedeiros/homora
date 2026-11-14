import type { Impact } from '@/lib/hosts';

/** What the causes need to know about one service. Only services that are down are grouped. */
export type CauseInput = {
  id: number;
  down: boolean;
  /** Why the monitor says it failed, and the HTTP code when there was one. */
  reason?: string;
  httpStatus?: number | null;
  /** When the open incident began (ms), when known. */
  since?: number | null;
  impact?: Impact;
};

export type CauseKind = 'guest-stopped' | 'host-offline' | 'same-error' | 'no-response' | 'other';

export type Cause = {
  kind: CauseKind;
  /** Stable across renders while the same services share the same problem. */
  key: string;
  ids: number[];
  /** Monitor reason and code shared by the services, for the "same error" and "other" causes. */
  reason?: string;
  httpStatus?: number | null;
  /** Earliest start among the services, or null when none is known. */
  since: number | null;
};

/** Failures that start within this window are read as one event. */
export const SAME_TIME_WINDOW_MS = 10 * 60_000;

const earliest = (values: (number | null | undefined)[]) => {
  const known = values.filter((value): value is number => typeof value === 'number');
  return known.length ? Math.min(...known) : null;
};

/**
 * Turns "N services are down" into the few things worth looking at. It only reads what Homora
 * already knows, never guesses at infrastructure: a cause is something the monitor and the host
 * link both say, and the wording in the UI stays "likely".
 *
 * Order of rules, each service going to the first that fits:
 * 1. its host is offline, or its guest is stopped (from the Proxmox link);
 * 2. two or more services fail with the same reason and code, starting within ten minutes;
 * 3. the host does not answer at all;
 * 4. anything else, grouped by reason.
 */
export function groupCauses(services: CauseInput[]): Cause[] {
  const down = services.filter((service) => service.down);
  const taken = new Set<number>();
  const causes: Cause[] = [];
  const add = (cause: Omit<Cause, 'key' | 'since'> & { key?: string }, members: CauseInput[]) => {
    members.forEach((member) => taken.add(member.id));
    causes.push({
      ...cause,
      key: cause.key ?? `${cause.kind}:${cause.reason ?? ''}:${members.map((m) => m.id).join(',')}`,
      ids: members.map((member) => member.id),
      since: earliest(members.map((member) => member.since)),
    });
  };

  for (const kind of ['host-offline', 'guest-stopped'] as const) {
    const members = down.filter((service) => service.impact === kind);
    if (members.length) add({ kind, ids: [] }, members);
  }

  const left = () => down.filter((service) => !taken.has(service.id));
  const byError = new Map<string, CauseInput[]>();
  for (const service of left()) {
    if (!service.reason || service.reason === 'no-response') continue;
    const key = `${service.reason}:${service.httpStatus ?? ''}`;
    byError.set(key, [...(byError.get(key) ?? []), service]);
  }
  for (const members of byError.values()) {
    if (members.length < 2) continue;
    // Walk the failures in time order and cut a new event wherever the gap is too long.
    const ordered = [...members].sort((a, b) => (a.since ?? 0) - (b.since ?? 0));
    let run: CauseInput[] = [];
    const flush = () => {
      if (run.length > 1)
        add(
          { kind: 'same-error', ids: [], reason: run[0]!.reason, httpStatus: run[0]!.httpStatus },
          run,
        );
      run = [];
    };
    for (const service of ordered) {
      const last = run[run.length - 1];
      const near =
        !last ||
        service.since == null ||
        last.since == null ||
        service.since - last.since <= SAME_TIME_WINDOW_MS;
      if (!near) flush();
      run.push(service);
    }
    flush();
  }

  const silent = left().filter((service) => service.reason === 'no-response');
  if (silent.length) add({ kind: 'no-response', ids: [], reason: 'no-response' }, silent);

  const rest = new Map<string, CauseInput[]>();
  for (const service of left()) {
    const key = `${service.reason ?? ''}:${service.httpStatus ?? ''}`;
    rest.set(key, [...(rest.get(key) ?? []), service]);
  }
  for (const members of rest.values())
    add(
      { kind: 'other', ids: [], reason: members[0]!.reason, httpStatus: members[0]!.httpStatus },
      members,
    );

  return causes.sort((a, b) => b.ids.length - a.ids.length || (a.since ?? 0) - (b.since ?? 0));
}
