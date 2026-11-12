import { isIP } from 'node:net';
import type { DatabaseSync } from 'node:sqlite';
import type { GuestType, HostLink, Service } from '@homora/shared';
import { authorizeDestination } from './network-policy.js';
import type { GuestAddresses, ProxmoxInventory } from './proxmox-inventory.js';

/** Independent kinds of evidence. A name match is deliberately not one of them. */
export type EvidenceKind = 'config-address' | 'guest-agent' | 'docker-source';
export type Evidence = { kind: EvidenceKind; address?: string };
export type Strength = 'strong' | 'medium';

export type GuestFacts = {
  connectionId: number;
  node: string;
  vmid: number;
  type: GuestType;
  name: string;
  status: string;
  config: string[];
  agent: string[];
  /** Cards that the user-associated Docker discovery source reports on this guest (decision 3). */
  dockerServiceIds?: number[];
};
export type Candidate = {
  host: HostLink;
  name: string;
  status: string;
  strength: Strength;
  evidence: Evidence[];
  /** Another guest has the same number of independent signals for this card. */
  ambiguous: boolean;
};
export type CardSuggestion = {
  serviceId: number;
  /** Ranked best first. Empty means "not enough evidence": only manual linking is offered. */
  candidates: Candidate[];
};

const key = (host: { connectionId: number; vmid: number; type: string }) =>
  `${host.connectionId}:${host.type}:${host.vmid}`;

/**
 * Pure ranking. A candidate needs at least one independent signal: Strong when two or more
 * different kinds agree, Medium for one. Names never count. When several guests tie for the
 * best signal count the card is ambiguous and each tied candidate is flagged (and a tied
 * Strong is reduced to Medium), because conflicting evidence must not look conclusive.
 */
export function rankSuggestions(
  cards: readonly { id: number; addresses: readonly string[] }[],
  guests: readonly GuestFacts[],
  dismissed: ReadonlySet<string> = new Set(),
): CardSuggestion[] {
  return cards.map((card) => {
    const candidates: Candidate[] = [];
    for (const guest of guests) {
      const host = {
        connectionId: guest.connectionId,
        node: guest.node,
        vmid: guest.vmid,
        type: guest.type,
      };
      if (dismissed.has(`${card.id}:${key(host)}`)) continue;
      const evidence: Evidence[] = [];
      const config = card.addresses.find((address) => guest.config.includes(address));
      if (config) evidence.push({ kind: 'config-address', address: config });
      const agent = card.addresses.find((address) => guest.agent.includes(address));
      if (agent) evidence.push({ kind: 'guest-agent', address: agent });
      if (guest.dockerServiceIds?.includes(card.id)) evidence.push({ kind: 'docker-source' });
      if (!evidence.length) continue;
      candidates.push({
        host,
        name: guest.name,
        status: guest.status,
        strength: evidence.length >= 2 ? 'strong' : 'medium',
        evidence,
        ambiguous: false,
      });
    }
    candidates.sort((a, b) => b.evidence.length - a.evidence.length || a.host.vmid - b.host.vmid);
    const best = candidates[0]?.evidence.length ?? 0;
    const tied = candidates.filter((candidate) => candidate.evidence.length === best);
    if (tied.length > 1)
      for (const candidate of tied) {
        candidate.ambiguous = true;
        candidate.strength = 'medium';
      }
    return { serviceId: card.id, candidates };
  });
}

/** Plain English for proposals, which are read by people and agents without the web locale. */
export function describeEvidence(evidence: Evidence): string {
  if (evidence.kind === 'config-address')
    return `The service address ${evidence.address} is configured on the guest.`;
  if (evidence.kind === 'guest-agent')
    return `The service address ${evidence.address} is reported by the guest agent.`;
  return 'A Docker discovery source tied to this guest reports a matching container.';
}

type Resolver = (hostname: string) => Promise<{ address: string; family: number }[]>;
type Connections = {
  listConnections(): Promise<{ id: number; type: string; name: string }[]>;
  inventoryData(id: number, refresh?: boolean): Promise<unknown>;
  addressData(id: number, guests: readonly unknown[]): Promise<unknown>;
};

/**
 * Resolves the addresses a card URL points to. An IP literal needs no lookup. A hostname is
 * resolved only through the shared outbound policy (the card's own private-network
 * authorization applies); when the policy blocks or the lookup fails there is simply no signal.
 */
export async function cardAddresses(
  service: Pick<Service, 'url' | 'allowPrivate'>,
  resolver?: Resolver,
): Promise<string[]> {
  let url: URL;
  try {
    url = new URL(service.url);
  } catch {
    return [];
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (isIP(host)) return [host];
  try {
    const { address } = await authorizeDestination(
      url.href,
      { origins: [url.origin], allowPrivate: service.allowPrivate === true },
      resolver,
    );
    return [address.address.toLowerCase()];
  } catch {
    return [];
  }
}

/** Orchestrates inventory, addresses, dismissals and the pure ranking. Read-only toward Proxmox. */
export function createHostSuggestions(options: {
  sqlite: DatabaseSync;
  connections: Connections;
  listServices: () => Pick<Service, 'id' | 'url' | 'allowPrivate' | 'name'>[];
  listHosts: () => Map<number, HostLink>;
  resolver?: Resolver;
}) {
  const { sqlite, connections } = options;
  const dismissals = () =>
    new Set(
      (
        sqlite
          .prepare('SELECT service_id,connection_id,vmid,type FROM host_suggestion_dismissals')
          .all() as { service_id: number; connection_id: number; vmid: number; type: string }[]
      ).map((row) => `${row.service_id}:${row.connection_id}:${row.type}:${row.vmid}`),
    );
  return {
    async list() {
      const linked = options.listHosts();
      const unlinked = options.listServices().filter((service) => !linked.has(service.id));
      const proxmox = (await connections.listConnections()).filter(
        (item) => item.type === 'proxmox',
      );
      const guests: GuestFacts[] = [];
      const unavailable: number[] = [];
      for (const connection of proxmox) {
        try {
          const inventory = (await connections.inventoryData(connection.id)) as {
            data: ProxmoxInventory;
          } | null;
          if (!inventory || typeof inventory !== 'object') throw new Error();
          const addresses = (await connections.addressData(
            connection.id,
            inventory.data.guests,
          )) as {
            data: GuestAddresses[];
          } | null;
          const byGuest = new Map(
            (addresses?.data ?? []).map((item) => [`${item.type}:${item.vmid}`, item]),
          );
          for (const guest of inventory.data.guests) {
            const known = byGuest.get(`${guest.type}:${guest.vmid}`);
            guests.push({
              connectionId: connection.id,
              node: guest.node,
              vmid: guest.vmid,
              type: guest.type,
              name: guest.name,
              status: guest.status,
              config: known?.config ?? [],
              agent: known?.agent ?? [],
            });
          }
        } catch {
          unavailable.push(connection.id);
        }
      }
      const cards = await Promise.all(
        unlinked.map(async (service) => ({
          id: service.id,
          addresses: await cardAddresses(service, options.resolver),
        })),
      );
      return {
        suggestions: rankSuggestions(cards, guests, dismissals()),
        unavailableConnections: unavailable,
      };
    },
    /** Records or clears a dismissal for one card and guest. */
    setDismissed(serviceId: number, host: HostLink, dismissed: boolean) {
      if (!sqlite.prepare('SELECT id FROM services WHERE id=?').get(serviceId)) return false;
      if (dismissed)
        sqlite
          .prepare(
            'INSERT OR IGNORE INTO host_suggestion_dismissals(service_id,connection_id,node,vmid,type,created_at) VALUES(?,?,?,?,?,?)',
          )
          .run(serviceId, host.connectionId, host.node, host.vmid, host.type, Date.now());
      else
        sqlite
          .prepare(
            'DELETE FROM host_suggestion_dismissals WHERE service_id=? AND connection_id=? AND vmid=? AND type=?',
          )
          .run(serviceId, host.connectionId, host.vmid, host.type);
      return true;
    },
  };
}
