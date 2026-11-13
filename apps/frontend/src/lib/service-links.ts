import {
  linkOpenTarget,
  type LinkColor,
  type LinkType,
  type OpenTarget,
  type Service,
  type ServiceLink,
  type ServiceLinkInput,
} from '@homora/shared';

/** Chip colors for address types. Text and fill come from the theme tokens, so both themes work. */
export const LINK_COLOR_CLASS: Record<LinkColor, string> = {
  neutral: 'bg-muted-foreground/15 text-muted-foreground',
  ember: 'bg-primary/15 text-accent-text',
  green: 'bg-success/15 text-success',
  blue: 'bg-info/15 text-info',
  violet: 'bg-link-violet/15 text-link-violet',
  pink: 'bg-link-pink/15 text-link-pink',
  teal: 'bg-link-teal/15 text-link-teal',
  yellow: 'bg-warning/15 text-warning',
};
/** Solid dot of the same color, for the color picker. */
export const LINK_COLOR_DOT: Record<LinkColor, string> = {
  neutral: 'bg-muted-foreground',
  ember: 'bg-primary',
  green: 'bg-success',
  blue: 'bg-info',
  violet: 'bg-link-violet',
  pink: 'bg-link-pink',
  teal: 'bg-link-teal',
  yellow: 'bg-warning',
};

/** A row of the form: the input plus a stable key for React. */
export type LinkDraft = Required<Pick<ServiceLinkInput, 'url' | 'name'>> & {
  key: string;
  typeId: number | null;
  openTarget: OpenTarget | null;
};

let nextKey = 0;
export const newLinkKey = () => `link-${(nextKey += 1)}`;

export const emptyLinkDraft = (typeId: number | null = null): LinkDraft => ({
  key: newLinkKey(),
  url: '',
  name: '',
  typeId,
  openTarget: null,
});

export const linkDrafts = (links: ServiceLink[] | undefined): LinkDraft[] =>
  (links ?? []).map((link) => ({
    key: newLinkKey(),
    url: link.url,
    name: link.name,
    typeId: link.type?.id ?? null,
    openTarget: link.openTarget,
  }));

/** What the API takes: no React key, and nothing for an empty optional field. */
export const linkInputs = (drafts: LinkDraft[]): ServiceLinkInput[] =>
  drafts.map(({ url, name, typeId, openTarget }) => ({ url, name, typeId, openTarget }));

export const sameLinks = (a: LinkDraft[], b: LinkDraft[]) =>
  JSON.stringify(linkInputs(a)) === JSON.stringify(linkInputs(b));

export type LinkTypeWithUses = LinkType & { uses: number };

/** True when a service has addresses besides its main URL. */
export const hasExtraLinks = (service: Pick<Service, 'links'>) => (service.links?.length ?? 0) > 0;

/** Opens an address the way the card opens its own: same tab navigates, otherwise a new tab. */
export function openAddress(url: string, target: OpenTarget) {
  if (target === 'same-tab') window.location.assign(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}

export { linkOpenTarget };
