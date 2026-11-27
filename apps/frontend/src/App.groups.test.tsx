// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { App } from './App';

// The cards live in the Services view.
beforeEach(() => {
  window.history.replaceState(null, '', '/services');
});

afterEach(() => {
  cleanup();
  // Toasts live in a module-level store and would leak into the next test.
  toast.dismiss();
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('creates, displays, and removes an empty group via UI', async () => {
  let groups: { id: number; name: string; position: number }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/auth/status')
      return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
    if (url === '/api/connections') return { ok: true, json: async () => [] };
    if (url === '/api/services')
      return {
        ok: true,
        json: async () => [
          { id: 1, name: 'Wiki', url: 'http://localhost:1/', category: 'Casa', description: '' },
        ],
      };
    if (url === '/api/groups' && init?.method === 'POST') {
      const group = {
        id: groups.length + 1,
        name: JSON.parse(String(init.body)).name,
        position: groups.length,
      };
      groups.push(group);
      return { ok: true, status: 201, json: async () => group };
    }
    if (url.startsWith('/api/groups/') && init?.method === 'DELETE') {
      groups = groups.filter((group) => `/api/groups/${group.id}` !== url);
      return { ok: true, json: async () => ({ deleted: true }) };
    }
    if (url.startsWith('/api/groups/') && init?.method === 'PUT') {
      const id = Number(url.split('/').at(-1));
      groups = groups.map((group) =>
        group.id === id ? { ...group, name: JSON.parse(String(init.body)).name } : group,
      );
      return { ok: true, json: async () => groups.find((group) => group.id === id) };
    }
    if (url === '/api/groups') return { ok: true, json: async () => [...groups] };
    return { ok: true, json: async () => [] };
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  await screen.findByRole('link', { name: /Wiki/ });
  expect(screen.queryByLabelText('Novo grupo')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Organizar' }));
  // The new group form stays closed until its button is used.
  expect(screen.queryByLabelText('Novo grupo')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Novo grupo' }));
  fireEvent.change(screen.getByLabelText('Novo grupo'), { target: { value: 'Infra' } });
  fireEvent.click(screen.getByRole('button', { name: 'Criar grupo' }));
  expect(await screen.findByRole('heading', { name: /Infra/ })).toBeTruthy();
  expect(screen.getByText('Este grupo ainda não tem cards.')).toBeTruthy();
  const menu = () =>
    fireEvent.keyDown(screen.getByRole('button', { name: 'Opções do grupo Infra' }), {
      key: 'Enter',
    });
  menu();
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Renomear' }));
  expect(screen.queryByLabelText('Novo grupo')).toBeNull();
  // The menu closes after a tick; the name field must end up focused, not the menu button.
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByLabelText('Novo nome do grupo')),
  );
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Opções do grupo Infra' }),
    ),
  );
  menu();
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Renomear' }));
  fireEvent.change(screen.getByLabelText('Novo nome do grupo'), {
    target: { value: 'Infraestrutura' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }));
  expect(await screen.findByRole('heading', { name: /Infraestrutura/ })).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Opções do grupo Infraestrutura' }), {
    key: 'Enter',
  });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Remover' }));
  // Removing asks first; cancelling keeps the group.
  const dialog = await screen.findByRole('alertdialog');
  expect(within(dialog).getByText(/Remover o grupo "Infraestrutura"/)).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(screen.getByRole('heading', { name: /Infraestrutura/ })).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Opções do grupo Infraestrutura' }), {
    key: 'Enter',
  });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Remover' }));
  fireEvent.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remover' }),
  );
  await waitFor(() => expect(screen.queryByRole('heading', { name: /Infraestrutura/ })).toBeNull());
});

it('reorders cards and closes form with Escape restoring focus', async () => {
  const cards = [
    {
      id: 1,
      name: 'A',
      url: 'http://localhost:8101/',
      category: 'Casa',
      description: '',
      position: 0,
    },
    {
      id: 2,
      name: 'B',
      url: 'http://localhost:8102/',
      category: 'Casa',
      description: '',
      position: 1,
    },
  ];
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/auth/status')
      return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
    if (url === '/api/connections') return { ok: true, json: async () => [] };
    if (url === '/api/groups')
      return { ok: true, json: async () => [{ id: 1, name: 'Casa', position: 0 }] };
    if (url === '/api/services/order') return { ok: true, json: async () => ({ ok: true }) };
    return { ok: true, json: async () => cards };
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  await screen.findByRole('link', { name: /A/ });
  expect(screen.queryByRole('button', { name: 'Mover A para baixo' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Organizar' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Mover A para baixo' }));
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/services/order',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ category: 'Casa', ids: [2, 1] }),
      }),
    ),
  );
  // Adding a service lives in Organize mode.
  const add = screen.getByRole('button', { name: /Adicionar serviço/ });
  fireEvent.click(add);
  expect(document.activeElement).toBe(screen.getByLabelText('Nome'));
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(document.activeElement).toBe(add));
  expect(screen.queryByRole('form', { name: 'Novo serviço' })).toBeNull();
});

it('provides quick search, cards view, and collapsible groups', async () => {
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/status')
        return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
      if (url === '/api/services')
        return {
          ok: true,
          json: async () => [
            {
              id: 1,
              name: 'Jellyfin',
              url: 'https://example.com/',
              category: 'Mídia',
              description: 'Filmes',
            },
          ],
        };
      if (url === '/api/service-status')
        return { ok: true, json: async () => ({ 1: { status: 'available' } }) };
      return { ok: true, json: async () => [] };
    }),
  );
  render(<App />);
  await screen.findByRole('link', { name: /Jellyfin/ });
  fireEvent.click(screen.getByRole('button', { name: 'Exibição' }));
  fireEvent.click(await screen.findByRole('radio', { name: 'Cards' }));
  expect(localStorage.getItem('homora-density')).toBe('cards');
  fireEvent.click(screen.getByRole('button', { name: 'Recolher grupo Mídia' }));
  expect(screen.queryByRole('link', { name: /Jellyfin/ })).toBeNull();
  localStorage.clear();
});

it('opens the new service form straight from the empty dashboard', async () => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/status')
        return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
      return { ok: true, json: async () => [] };
    }),
  );
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Adicionar primeiro serviço' }));
  expect(window.location.pathname).toBe('/manage/services/new');
  expect(await screen.findByRole('form', { name: 'Novo serviço' })).toBeTruthy();
});

it('moves a service to another group from the organize menu', async () => {
  localStorage.clear();
  window.history.replaceState(null, '', '/manage/services');
  const calls: { url: string; method?: string; body?: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      calls.push({ url, method: init?.method, body: init?.body });
      if (url === '/api/auth/status')
        return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
      if (url === '/api/services' && !init?.method)
        return {
          ok: true,
          json: async () => [
            { id: 1, name: 'Wiki', url: 'http://wiki.test/', category: 'Casa', description: '' },
            { id: 2, name: 'Proxmox', url: 'http://pve.test/', category: 'Infra', description: '' },
          ],
        };
      return { ok: true, json: async () => (init?.method ? {} : []) };
    }),
  );
  render(<App />);
  await screen.findByText('Wiki');
  fireEvent.click(screen.getByRole('button', { name: 'Organizar' }));
  fireEvent.keyDown(screen.getByRole('button', { name: 'Opções de Wiki' }), { key: 'Enter' });
  fireEvent.keyDown(await screen.findByRole('menuitem', { name: 'Mover para o grupo' }), {
    key: 'ArrowRight',
  });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Infra' }));
  await waitFor(() => {
    const put = calls.find((call) => call.url === '/api/services/1' && call.method === 'PUT');
    expect(put).toBeTruthy();
    expect(JSON.parse(put?.body ?? '{}')).toMatchObject({ name: 'Wiki', category: 'Infra' });
  });
  window.history.replaceState(null, '', '/');
});

it('moves a service by dragging it onto another group row or an empty group', async () => {
  localStorage.clear();
  window.history.replaceState(null, '', '/manage/services');
  const calls: { url: string; method?: string; body?: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      calls.push({ url, method: init?.method, body: init?.body });
      if (url === '/api/auth/status')
        return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
      if (url === '/api/services' && !init?.method)
        return {
          ok: true,
          json: async () => [
            { id: 1, name: 'Wiki', url: 'http://wiki.test/', category: 'Casa', description: '' },
            { id: 2, name: 'Proxmox', url: 'http://pve.test/', category: 'Infra', description: '' },
          ],
        };
      if (url === '/api/groups' && !init?.method)
        return {
          ok: true,
          json: async () => [
            { id: 1, name: 'Casa', position: 0, columns: null },
            { id: 2, name: 'Infra', position: 1, columns: null },
            { id: 3, name: 'Vazio', position: 2, columns: null },
          ],
        };
      return { ok: true, json: async () => (init?.method ? {} : []) };
    }),
  );
  render(<App />);
  await screen.findByText('Wiki');
  fireEvent.click(screen.getByRole('button', { name: 'Organizar' }));
  const rowOf = (name: string) => screen.getByText(name).closest('li') as HTMLElement;
  const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn() };
  // Onto a row of another group.
  fireEvent.dragStart(rowOf('Wiki'), { dataTransfer });
  fireEvent.dragOver(rowOf('Proxmox'), { dataTransfer });
  fireEvent.drop(rowOf('Proxmox'), { dataTransfer });
  await waitFor(() => {
    const put = calls.find((call) => call.url === '/api/services/1' && call.method === 'PUT');
    expect(JSON.parse(put?.body ?? '{}')).toMatchObject({ category: 'Infra' });
  });
  calls.length = 0;
  // Onto an empty group's drop zone, which only exists while dragging.
  expect(document.querySelector('[data-group-drop]')).toBeNull();
  fireEvent.dragStart(rowOf('Proxmox'), { dataTransfer });
  const zone = await waitFor(() => {
    const found = document.querySelector('[data-group-drop]');
    expect(found).toBeTruthy();
    return found as HTMLElement;
  });
  fireEvent.dragOver(zone, { dataTransfer });
  fireEvent.drop(zone, { dataTransfer });
  await waitFor(() => {
    const put = calls.find((call) => call.url === '/api/services/2' && call.method === 'PUT');
    expect(JSON.parse(put?.body ?? '{}')).toMatchObject({ category: 'Vazio' });
  });
  window.history.replaceState(null, '', '/');
});

it('keeps focus on an arrow when its row reaches the end and announces the position', async () => {
  localStorage.clear();
  window.history.replaceState(null, '', '/manage/services');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      if (url === '/api/auth/status')
        return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
      if (url === '/api/services' && !init?.method)
        return {
          ok: true,
          json: async () => [
            { id: 1, name: 'Alfa', url: 'http://wiki.test/', category: 'Casa', description: '' },
            { id: 2, name: 'Beta', url: 'http://notes.test/', category: 'Casa', description: '' },
          ],
        };
      return { ok: true, json: async () => (init?.method ? {} : []) };
    }),
  );
  render(<App />);
  await screen.findByText('Alfa');
  fireEvent.click(screen.getByRole('button', { name: 'Organizar' }));
  const down = screen.getByRole('button', { name: 'Mover Alfa para baixo' });
  down.focus();
  fireEvent.click(down);
  expect(await screen.findByText('Alfa: posição 2 de 2.')).toBeTruthy();
  // At the end the arrow stays focusable instead of dropping focus to the page.
  expect(
    screen.getByRole('button', { name: 'Mover Alfa para baixo' }).getAttribute('aria-disabled'),
  ).toBe('true');
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'Mover Alfa para baixo' }),
  );
  window.history.replaceState(null, '', '/');
});

it('undoes a move to another group, restoring group and order', async () => {
  localStorage.clear();
  window.history.replaceState(null, '', '/manage/services');
  const calls: { url: string; method?: string; body?: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      calls.push({ url, method: init?.method, body: init?.body });
      if (url === '/api/auth/status')
        return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
      if (url === '/api/services' && !init?.method)
        return {
          ok: true,
          json: async () => [
            {
              id: 1,
              name: 'Alfa',
              url: 'http://a.test/',
              category: 'Casa',
              description: '',
              position: 0,
            },
            {
              id: 3,
              name: 'Beta',
              url: 'http://b.test/',
              category: 'Casa',
              description: '',
              position: 1,
            },
            { id: 2, name: 'Proxmox', url: 'http://pve.test/', category: 'Infra', description: '' },
          ],
        };
      return { ok: true, json: async () => (init?.method ? {} : []) };
    }),
  );
  render(<App />);
  await screen.findByText('Alfa');
  fireEvent.click(screen.getByRole('button', { name: 'Organizar' }));
  fireEvent.keyDown(screen.getByRole('button', { name: 'Opções de Alfa' }), { key: 'Enter' });
  fireEvent.keyDown(await screen.findByRole('menuitem', { name: 'Mover para o grupo' }), {
    key: 'ArrowRight',
  });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Infra' }));
  const undo = await screen.findByRole('button', { name: 'Desfazer' });
  vi.useFakeTimers();
  fireEvent.click(undo);
  // Sonner schedules removal after its exit animation; finish it before unmounting.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });
  vi.useRealTimers();
  await waitFor(() => {
    const order = calls.find((call) => call.url === '/api/services/order');
    expect(JSON.parse(order?.body ?? '{}')).toEqual({ category: 'Casa', ids: [1, 3] });
  });
  const puts = calls.filter((call) => call.url === '/api/services/1' && call.method === 'PUT');
  expect(puts.map((call) => JSON.parse(call.body ?? '{}').category)).toEqual(['Infra', 'Casa']);
  window.history.replaceState(null, '', '/');
});

it('offers Organize on an empty Services view, to add the first service or group', async () => {
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/status')
        return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
      return { ok: true, json: async () => [] };
    }),
  );
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Organizar' }));
  expect(screen.getByRole('button', { name: 'Novo grupo' })).toBeTruthy();
  expect(screen.getAllByRole('button', { name: /Adicionar serviço/ }).length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: 'Concluir' })).toBeTruthy();
});
