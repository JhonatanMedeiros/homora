// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Service } from '@homora/shared';
import { setLocale } from '@/i18n';
import { ServiceCard } from './service-card';
import { ServiceLinksMenu } from './service-links-menu';

beforeEach(() => setLocale('en'));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const lan = { id: 1, name: 'LAN', color: 'green' as const };
const service: Service = {
  id: 7,
  name: 'Nextcloud',
  url: 'https://cloud.example.com/',
  category: 'Home',
  description: '',
  openTarget: 'new-tab',
  links: [
    { id: 1, url: 'http://192.168.1.5:8080/', name: '', openTarget: null, type: lan },
    {
      id: 2,
      url: 'https://cloud.example.com/admin',
      name: 'Admin panel',
      openTarget: 'same-tab',
      type: null,
    },
  ],
};

it('renders nothing for a service without extra addresses', () => {
  const { container } = render(<ServiceLinksMenu service={{ ...service, links: [] }} />);
  expect(container.innerHTML).toBe('');
  const { container: absent } = render(
    <ServiceLinksMenu service={{ ...service, links: undefined }} />,
  );
  expect(absent.innerHTML).toBe('');
});

it('lists the main address first and each extra with its own way of opening', () => {
  render(<ServiceLinksMenu service={service} />);
  const button = screen.getByRole('button', { name: 'Links for Nextcloud, 3 addresses' });
  expect(button.textContent).toContain('3');
  fireEvent.click(button);
  const list = screen.getByRole('list', { name: 'Links for Nextcloud' });
  const links = within(list).getAllByRole('link');
  expect(links.map((link) => link.getAttribute('href'))).toEqual([
    'https://cloud.example.com/',
    'http://192.168.1.5:8080/',
    'https://cloud.example.com/admin',
  ]);
  expect(within(list).getByText('Main')).toBeTruthy();
  expect(within(list).getByText('LAN')).toBeTruthy();
  expect(within(list).getByText('Admin panel')).toBeTruthy();
  // The service opens in a new tab; the admin address overrides it with the same tab.
  expect(links[0].getAttribute('target')).toBe('_blank');
  expect(links[1].getAttribute('target')).toBe('_blank');
  expect(links[1].getAttribute('rel')).toContain('noopener');
  expect(links[2].getAttribute('target')).toBeNull();
});

it('uses the service default when an address does not choose', () => {
  render(<ServiceLinksMenu service={{ ...service, openTarget: 'same-tab' }} />);
  fireEvent.click(screen.getByRole('button', { name: /Links for Nextcloud/ }));
  const links = within(screen.getByRole('list')).getAllByRole('link');
  expect(links[0].getAttribute('target')).toBeNull();
  expect(links[1].getAttribute('target')).toBeNull();
});

it('copies an address and closes when one is opened', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
  render(<ServiceLinksMenu service={service} />);
  fireEvent.click(screen.getByRole('button', { name: /Links for Nextcloud/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Copy http://192.168.1.5:8080/' }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('http://192.168.1.5:8080/'));
  const link = screen.getAllByRole('link')[1];
  link.addEventListener('click', (event) => event.preventDefault());
  fireEvent.click(link);
  await waitFor(() => expect(screen.queryByRole('list')).toBeNull());
});

it.each([false, true])('shows the button on cards without disturbing them (list: %s)', (list) => {
  render(
    <ul>
      <ServiceCard
        service={service}
        blocked={false}
        list={list}
        showDescription
        onEdit={() => {}}
      />
    </ul>,
  );
  expect(screen.getByRole('button', { name: /Links for Nextcloud/ })).toBeTruthy();
  // The card's own link is still the main address.
  expect(screen.getByRole('link', { name: /Nextcloud/ }).getAttribute('href')).toBe(
    'https://cloud.example.com/',
  );
});

it('leaves cards without extra addresses exactly as before', () => {
  render(
    <ul>
      <ServiceCard
        service={{ ...service, links: [] }}
        blocked={false}
        showDescription
        onEdit={() => {}}
      />
    </ul>,
  );
  expect(screen.queryByRole('button', { name: /Links for/ })).toBeNull();
});
