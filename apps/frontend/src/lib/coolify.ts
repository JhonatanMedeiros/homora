import {
  COOLIFY_UUID_PATTERN,
  type CoolifyResource,
  type CoolifyState,
  type ResourceLink,
} from '@homora/shared';

/** Everything here treats the inventory as untrusted: shapes and sizes are checked before use. */
const STATES: readonly CoolifyState[] = ['running', 'degraded', 'stopped', 'unknown'];
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max;

export { parseSummary } from '@homora/integrations/coolify/frontend';

function parseResource(value: unknown): CoolifyResource | null {
  if (!isRecord(value)) return null;
  const { uuid, type, name, description, state, rawStatus, urls, environmentId } = value;
  if (typeof uuid !== 'string' || !COOLIFY_UUID_PATTERN.test(uuid)) return null;
  if (type !== 'application' && type !== 'service') return null;
  if (!text(name, 256) || name.trim() === '') return null;
  return {
    uuid,
    type,
    name,
    description: text(description, 1024) ? description : null,
    state: STATES.includes(state as CoolifyState) ? (state as CoolifyState) : 'unknown',
    rawStatus: text(rawStatus, 64) ? rawStatus : null,
    urls: Array.isArray(urls)
      ? urls.filter((url): url is string => text(url, 2048) && isHttpUrl(url)).slice(0, 5)
      : [],
    environmentId: count(environmentId) ? environmentId : null,
  };
}

/** `{ data: { resources }, checkedAt }` from the backend; null when the body is not that. */
export function parseInventory(
  body: unknown,
): { resources: CoolifyResource[]; checkedAt?: string } | null {
  if (!isRecord(body) || !isRecord(body.data) || !Array.isArray(body.data.resources)) return null;
  const seen = new Set<string>();
  const resources: CoolifyResource[] = [];
  for (const item of body.data.resources.slice(0, 1000)) {
    const resource = parseResource(item);
    if (!resource || seen.has(resource.uuid)) continue;
    seen.add(resource.uuid);
    resources.push(resource);
  }
  return { resources, checkedAt: typeof body.checkedAt === 'string' ? body.checkedAt : undefined };
}

export function parseLinks(body: unknown): ResourceLink[] {
  if (!Array.isArray(body)) return [];
  const links: ResourceLink[] = [];
  for (const item of body) {
    if (!isRecord(item)) continue;
    const { id, serviceId, integrationId, resourceUuid, resourceType, seenName, seenUrl } = item;
    if (
      !count(id) ||
      !count(serviceId) ||
      !count(integrationId) ||
      typeof resourceUuid !== 'string' ||
      !COOLIFY_UUID_PATTERN.test(resourceUuid) ||
      (resourceType !== 'application' && resourceType !== 'service') ||
      !text(seenName, 256)
    )
      continue;
    links.push({
      id,
      serviceId,
      integrationId,
      resourceUuid,
      resourceType,
      seenName,
      seenUrl: text(seenUrl, 2048) ? seenUrl : null,
    });
  }
  return links;
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Addresses compare by host and path, ignoring case, a trailing slash and the default port. */
export function sameUrl(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const key = (value: string) => {
    try {
      const url = new URL(value);
      return `${url.protocol}//${url.host.toLowerCase()}${url.pathname.replace(/\/+$/, '')}`;
    } catch {
      return value.trim().toLowerCase();
    }
  };
  return key(a) === key(b);
}

export type LinkView =
  | { kind: 'unavailable' }
  | { kind: 'missing' }
  | {
      kind: 'found';
      resource: CoolifyResource;
      nameChanged: boolean;
      urlChanged: boolean;
      /** Values Coolify reports now; applied to the card only after an explicit review. */
      newName: string;
      newUrl: string | null;
    };

/** Compares a link with the live inventory. `null` inventory means it could not be read. */
export function viewLink(link: ResourceLink, inventory: CoolifyResource[] | null): LinkView {
  if (inventory === null) return { kind: 'unavailable' };
  const resource = inventory.find((item) => item.uuid === link.resourceUuid);
  if (!resource) return { kind: 'missing' };
  const known = link.seenUrl !== null && resource.urls.some((url) => sameUrl(url, link.seenUrl));
  const urlChanged = link.seenUrl !== null ? !known : resource.urls.length > 0;
  return {
    kind: 'found',
    resource,
    nameChanged: resource.name !== link.seenName,
    urlChanged,
    newName: resource.name,
    newUrl: known ? link.seenUrl : (resource.urls[0] ?? null),
  };
}

export const needsReview = (view: LinkView) =>
  view.kind === 'found' && (view.nameChanged || view.urlChanged);

/** Text over name, description and addresses, plus type and state filters ('all' keeps everything). */
export function filterResources(
  resources: CoolifyResource[],
  query: string,
  type: string,
  state: string,
) {
  const needle = query.trim().toLowerCase();
  return resources.filter(
    (resource) =>
      (type === 'all' || resource.type === type) &&
      (state === 'all' || resource.state === state) &&
      (needle === '' ||
        [resource.name, resource.description ?? '', ...resource.urls].some((value) =>
          value.toLowerCase().includes(needle),
        )),
  );
}
