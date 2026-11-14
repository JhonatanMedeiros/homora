// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Service } from '@homora/shared';
import { ServiceCard } from '@/features/dashboard/service-card';
import { ResourceReviewDialog } from '@/components/resource-review-dialog';
import { useResourceLinks, type CardResource } from '@/hooks/use-resource-links';
import { viewLink } from '@homora/integrations/resources/client';
import type { IntegrationResource, ResourceLink } from '@homora/integrations';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const service: Service = {
  id: 7,
  name: 'Blog',
  url: 'https://blog.example.com',
  category: 'Apps',
  description: '',
};
const link: ResourceLink = {
  id: 1,
  serviceId: 7,
  integrationId: 2,
  resourceUuid: 'abc',
  resourceType: 'application',
  seenName: 'Blog',
  seenUrl: 'https://blog.example.com',
};
const resource = (over: Partial<IntegrationResource> = {}): IntegrationResource => ({
  uuid: 'abc',
  type: 'application',
  name: 'Blog',
  description: null,
  state: 'running',
  rawStatus: 'running:healthy',
  urls: ['https://blog.example.com'],
  environmentId: null,
  ...over,
});
const info = (inventory: IntegrationResource[] | null): CardResource => ({
  link,
  view: viewLink(link, inventory),
});
const card = (resourceLink: CardResource) =>
  render(
    <ServiceCard
      service={service}
      resourceLink={resourceLink}
      blocked={false}
      showDescription={false}
      onEdit={() => {}}
    />,
  );

it('shows the Coolify state in text on its own line, apart from the HTTP status', () => {
  card(info([resource({ state: 'stopped' })]));
  expect(screen.getByText('Status da integração:')).toBeTruthy();
  expect(screen.getByText('Parado')).toBeTruthy();
  expect(screen.queryByText('Precisa de revisão')).toBeNull();
});

it('says unavailable, never offline, when Coolify could not be read', () => {
  card(info(null));
  expect(screen.getByText('Indisponível')).toBeTruthy();
  expect(screen.queryByText(/offline|fora do ar/i)).toBeNull();
});

it('flags a missing resource and a changed name or address for review', () => {
  card(info([]));
  expect(screen.getByText('Não encontrado')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Revisar' })).toBeTruthy();
  cleanup();
  card(info([resource({ name: 'Blog novo', urls: ['https://novo.example'] })]));
  expect(screen.getByText('Precisa de revisão')).toBeTruthy();
});

function review(resourceLink: CardResource) {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        method: init?.method ?? 'GET',
        url,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return { ok: true, json: async () => ({ ok: true }) };
    }),
  );
  const onChanged = vi.fn();
  render(
    <ResourceReviewDialog
      service={service}
      info={resourceLink}
      onClose={() => {}}
      onChanged={onChanged}
    />,
  );
  return { calls, onChanged };
}
const changed = () => info([resource({ name: 'Blog novo', urls: ['https://novo.example'] })]);

it('shows old and new values and changes nothing until a choice is made', () => {
  const { calls } = review(changed());
  expect(screen.getByText('https://novo.example')).toBeTruthy();
  expect(screen.getByText('Blog novo')).toBeTruthy();
  expect(calls).toHaveLength(0);
});

it('keeps the card as is and only acknowledges the reviewed values', async () => {
  const { calls, onChanged } = review(changed());
  fireEvent.click(screen.getByRole('button', { name: 'Manter o card como está' }));
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  expect(calls).toEqual([
    expect.objectContaining({
      method: 'PUT',
      url: '/api/services/7/resource-link',
      body: expect.objectContaining({ name: 'Blog novo', url: 'https://novo.example' }),
    }),
  ]);
});

it('updates the card only on an explicit click, then records the link', async () => {
  const { calls } = review(changed());
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar o card' }));
  await waitFor(() => expect(calls).toHaveLength(2));
  expect(calls[0]).toMatchObject({
    method: 'PUT',
    url: '/api/services/7',
    body: { name: 'Blog novo', url: 'https://novo.example', category: 'Apps' },
  });
  expect(calls[1]!.url).toBe('/api/services/7/resource-link');
});

it('only offers removing the link for a missing resource, keeping the card', async () => {
  const { calls } = review(info([]));
  expect(screen.queryByRole('button', { name: 'Atualizar o card' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Remover vínculo' }));
  await waitFor(() =>
    expect(calls).toEqual([
      expect.objectContaining({ method: 'DELETE', url: '/api/services/7/resource-link' }),
    ]),
  );
});

function Probe() {
  const { byService } = useResourceLinks();
  return (
    <p>
      {Object.values(byService)
        .map((entry) => `${entry.link.serviceId}:${entry.view.kind}`)
        .join(',')}
    </p>
  );
}

it('isolates a failing connection: its cards become unavailable, others keep their state', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/resource-links')
        return {
          ok: true,
          json: async () => [link, { ...link, id: 2, serviceId: 8, integrationId: 3 }],
        };
      if (url === '/api/connections/2/resources')
        return { ok: true, json: async () => ({ data: { resources: [resource()] } }) };
      return { ok: false, json: async () => ({}) };
    }),
  );
  render(<Probe />);
  expect(await screen.findByText('7:found,8:unavailable')).toBeTruthy();
});
