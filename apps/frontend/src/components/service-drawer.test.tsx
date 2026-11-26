// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { Service } from '@homora/shared';
import { ServiceDrawer } from './service-drawer';

afterEach(cleanup);

const service = {
  id: 7,
  name: 'Plex',
  url: 'https://plex.lab.test',
  openTarget: 'new-tab',
  checkType: 'http',
} as unknown as Service;

const show = (current: Service | null, onClose = () => {}) =>
  render(
    <MemoryRouter>
      <ServiceDrawer
        service={current}
        blocked={false}
        range="24h"
        onRangeChange={() => {}}
        onClose={onClose}
      />
    </MemoryRouter>,
  );

it('renders nothing while no service is chosen', () => {
  show(null);
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('shows the service with open, copy and full page links, and says when there is no data', () => {
  show(service);
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Plex' })).toBeTruthy();
  expect(screen.getByRole('link', { name: /Abrir$/ }).getAttribute('href')).toBe(
    'https://plex.lab.test',
  );
  expect(screen.getByRole('button', { name: 'Copiar endereço' })).toBeTruthy();
  expect(screen.getByRole('link', { name: /Abrir página completa/ }).getAttribute('href')).toBe(
    '/services/7',
  );
  expect(screen.getByText('Ainda não há dados de disponibilidade.')).toBeTruthy();
});

it('closes on Escape', () => {
  const onClose = vi.fn();
  show(service, onClose);
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(onClose).toHaveBeenCalled();
});

it('names the likely cause and offers the map and the permission', () => {
  const onShowMap = vi.fn();
  const onAllow = vi.fn();
  render(
    <MemoryRouter>
      <ServiceDrawer
        service={service}
        blocked
        range="24h"
        onRangeChange={() => {}}
        cause={{ kind: 'host-offline', host: 'pve2', affected: 3 }}
        onShowMap={onShowMap}
        onAllowMonitoring={onAllow}
        onClose={() => {}}
      />
    </MemoryRouter>,
  );
  expect(screen.getByText(/pve2 está fora do ar/).textContent).toContain('3 serviços');
  fireEvent.click(screen.getByRole('button', { name: 'Ver no mapa' }));
  fireEvent.click(screen.getByRole('button', { name: 'Revisar a permissão de monitoramento' }));
  expect(onShowMap).toHaveBeenCalled();
  expect(onAllow).toHaveBeenCalledWith(service);
});

it('says a loopback address cannot be authorized', () => {
  render(
    <MemoryRouter>
      <ServiceDrawer
        service={{ ...service, url: 'http://localhost:8080' }}
        blocked
        range="24h"
        onRangeChange={() => {}}
        onAllowMonitoring={() => {}}
        onClose={() => {}}
      />
    </MemoryRouter>,
  );
  expect(screen.getByText(/próprio servidor do Homora/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /permissão/ })).toBeNull();
});
