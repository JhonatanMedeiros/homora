// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ServiceCard } from './service-card';
import type { ServiceStatus } from '@/lib/services';

afterEach(cleanup);

const noop = () => {};
function show(status?: ServiceStatus, blocked = false) {
  cleanup();
  return render(
    <ul>
      <ServiceCard
        service={{
          id: 1,
          name: 'Wiki',
          url: 'https://wiki.test',
          category: 'Casa',
          description: '',
        }}
        status={status}
        blocked={blocked}
        organizing={false}
        managing={false}
        compact={false}
        showDescription
        confirmingRemoval={false}
        dragging={false}
        onEdit={noop}
        onRemove={noop}
        onCancelRemoval={noop}
        onMove={noop}
        dragProps={{ onDragStart: noop, onDragEnd: noop, onDragOver: noop, onDrop: noop }}
      />
    </ul>,
  );
}
const base = { lastAttempt: '2026-11-10T12:30:00.000Z' };

it('explica o estado com o motivo, o código HTTP e a latência', () => {
  show({ ...base, status: 'available', reason: 'login-required', httpStatus: 401, latencyMs: 42 });
  expect(screen.getByText('Exige login')).toBeTruthy();
  expect(screen.getByText('HTTP 401 · 42 ms')).toBeTruthy();

  show({ ...base, status: 'unavailable', reason: 'not-found', httpStatus: 404, latencyMs: 9 });
  expect(screen.getByText('Não encontrado')).toBeTruthy();
  expect(screen.getByText('HTTP 404 · 9 ms')).toBeTruthy();

  show({ ...base, status: 'available', reason: 'redirect', httpStatus: 302, latencyMs: 5 });
  expect(screen.getByText('Redireciona')).toBeTruthy();

  show({
    ...base,
    status: 'unavailable',
    reason: 'no-response',
    httpStatus: null,
    latencyMs: null,
  });
  expect(screen.getByText('Sem resposta')).toBeTruthy();
  expect(screen.queryByText(/HTTP/)).toBeNull();

  show({ status: 'unknown', lastAttempt: null, reason: 'unchecked', httpStatus: null });
  expect(screen.getByText('Não verificado')).toBeTruthy();
});

it('mostra o ping respondido com a latência, sem código HTTP', () => {
  show({ ...base, status: 'available', reason: 'reachable', httpStatus: null, latencyMs: 4 });
  expect(screen.getByText('Responde ao ping')).toBeTruthy();
  expect(screen.getByText('Ping · 4 ms')).toBeTruthy();
  expect(screen.queryByText(/HTTP/)).toBeNull();
});

it('mantém o rótulo simples quando responde bem e aceita respostas sem motivo', () => {
  show({ ...base, status: 'available', reason: 'responding', httpStatus: 200, latencyMs: 30 });
  expect(screen.getByText('Disponível')).toBeTruthy();
  expect(screen.queryByText(/HTTP/)).toBeNull();

  show({ ...base, status: 'unavailable' });
  expect(screen.getByText('Indisponível')).toBeTruthy();

  show({ ...base, status: 'unavailable', reason: 'no-response' }, true);
  expect(screen.getByText('Monitoramento bloqueado')).toBeTruthy();
});
