// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { App } from './App';

afterEach(() => {
  cleanup();
  // Toasts live in a module-level store and would leak into the next test.
  toast.dismiss();
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
});

it('allows sign-in after account creation even if first login fails', async () => {
  let attempts = 0;
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/auth/status')
      return { ok: true, json: async () => ({ configured: false, authenticated: false }) };
    if (url === '/api/auth/setup') return { ok: true };
    if (url === '/api/auth/sign-in/email') return { ok: ++attempts > 1 };
    if (url === '/api/connections') return { ok: true, json: async () => [] };
    return { ok: true, json: async () => [] };
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  fireEvent.change(await screen.findByLabelText('Nome'), { target: { value: 'Ana' } });
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@homora.test' } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-segura-123' } });
  fireEvent.change(screen.getByLabelText('Confirmar senha'), {
    target: { value: 'senha-segura-123' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
  expect(await screen.findByText('Bem-vindo de volta.')).toBeTruthy();
  expect((await screen.findByRole('alert')).textContent).toContain('E-mail ou senha inválidos');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Manter conectado' }));
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  expect(await screen.findByRole('heading', { name: /Tudo em seu lugar/ })).toBeTruthy();
  const calls = fetchMock.mock.calls as unknown as [string, { body: string }][];
  const setupCalls = calls.filter(([url]) => url === '/api/auth/setup');
  expect(setupCalls).toHaveLength(1);
  expect(JSON.parse(setupCalls[0][1].body)).toEqual({
    name: 'Ana',
    email: 'ana@homora.test',
    password: 'senha-segura-123',
  });
  const loginCalls = calls.filter(([url]) => url === '/api/auth/sign-in/email');
  expect(JSON.parse(loginCalls[0][1].body).rememberMe).toBe(false);
  expect(JSON.parse(loginCalls[1][1].body)).toEqual({
    rememberMe: true,
    email: 'ana@homora.test',
    password: 'senha-segura-123',
  });
});

it('does not create the account when the password confirmation differs', async () => {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/auth/status')
      return { ok: true, json: async () => ({ configured: false, authenticated: false }) };
    return { ok: true, json: async () => [] };
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  fireEvent.change(await screen.findByLabelText('Nome'), { target: { value: 'Ana' } });
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@homora.test' } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-segura-123' } });
  fireEvent.change(screen.getByLabelText('Confirmar senha'), {
    target: { value: 'senha-segura-124' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
  expect((await screen.findByRole('alert')).textContent).toContain('As senhas não coincidem');
  expect(fetchMock.mock.calls.some(([url]) => url === '/api/auth/setup')).toBe(false);
});

it('redirects to login and returns to protected route after authenticating', async () => {
  window.history.replaceState(null, '', '/manage/agents');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/status')
        return { ok: true, json: async () => ({ configured: true, authenticated: false }) };
      return { ok: true, json: async () => [] };
    }),
  );
  render(<App />);
  await screen.findByRole('button', { name: 'Entrar' });
  expect(window.location.pathname).toBe('/login');
  expect(new URLSearchParams(window.location.search).get('returnTo')).toBe('/manage/agents');
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@homora.test' } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-teste' } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  await waitFor(() => expect(window.location.pathname).toBe('/manage/agents'));
});

it('rejects external redirect after login', async () => {
  window.history.replaceState(null, '', '/login?returnTo=%2F%2Fexample.com');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/status')
        return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
      return { ok: true, json: async () => [] };
    }),
  );
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Tudo em seu lugar.' })).toBeTruthy();
  expect(window.location.pathname).toBe('/');
});

it('does not open the app after the password alone when a second step is required', async () => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/auth/status')
      return { ok: true, json: async () => ({ configured: true, authenticated: false }) };
    if (url === '/api/auth/sign-in/email')
      return {
        ok: true,
        json: async () => ({ twoFactorRedirect: true, twoFactorMethods: ['totp'] }),
      };
    if (url === '/api/auth/two-factor/verify-totp') {
      const { code } = JSON.parse(String(init?.body));
      return code === '123456'
        ? { ok: true, json: async () => ({}) }
        : { ok: false, json: async () => ({ code: 'two-factor-invalid-code' }) };
    }
    if (url === '/api/auth/two-factor/verify-backup-code')
      return { ok: true, json: async () => ({}) };
    return { ok: true, json: async () => [] };
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  fireEvent.change(await screen.findByLabelText('E-mail'), {
    target: { value: 'ana@homora.test' },
  });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-segura-123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

  expect(await screen.findByRole('heading', { name: 'Verificação em duas etapas' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: /Tudo em seu lugar/ })).toBeNull();
  // The sixth digit sends the code without pressing Verify; non-digits are ignored.
  fireEvent.change(screen.getByLabelText('Código de autenticação'), {
    target: { value: '00-00 00' },
  });
  expect((await screen.findByRole('alert')).textContent).toBe('O código não é válido.');
  expect(
    fetchMock.mock.calls.filter(([url]) => url === '/api/auth/two-factor/verify-totp'),
  ).toHaveLength(1);
  expect(screen.queryByRole('heading', { name: /Tudo em seu lugar/ })).toBeNull();

  // A recovery code is a separate route and field.
  fireEvent.click(screen.getByRole('button', { name: 'Usar um código de recuperação' }));
  fireEvent.change(screen.getByLabelText('Código de recuperação'), {
    target: { value: 'abcde-12345' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));
  expect(await screen.findByRole('heading', { name: /Tudo em seu lugar/ })).toBeTruthy();
  const urls = fetchMock.mock.calls.map(([url]) => url);
  expect(urls).toContain('/api/auth/two-factor/verify-backup-code');
});

it('returns to the password step when the sign-in challenge expired', async () => {
  window.history.replaceState(null, '', '/go/plex');
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/auth/status')
      return { ok: true, json: async () => ({ configured: true, authenticated: false }) };
    if (url === '/api/auth/sign-in/email')
      return { ok: true, json: async () => ({ twoFactorRedirect: true }) };
    if (url === '/api/auth/two-factor/verify-totp')
      return { ok: false, json: async () => ({ code: 'two-factor-challenge-expired' }) };
    return { ok: true, json: async () => [] };
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  fireEvent.change(await screen.findByLabelText('E-mail'), {
    target: { value: 'ana@homora.test' },
  });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-segura-123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  fireEvent.change(await screen.findByLabelText('Código de autenticação'), {
    target: { value: '123456' },
  });
  expect(await screen.findByText('Bem-vindo de volta.')).toBeTruthy();
  expect((await screen.findByRole('alert')).textContent).toContain('expirou');
  expect(fetchMock.mock.calls.some(([url]) => url === '/api/go/plex')).toBe(false);
  expect(new URLSearchParams(window.location.search).get('returnTo')).toBe('/go/plex');
});

it('shows how long to wait when sign-in is rate limited', async () => {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/auth/status')
      return { ok: true, json: async () => ({ configured: true, authenticated: false }) };
    if (url === '/api/auth/sign-in/email')
      return { ok: false, status: 429, headers: new Headers({ 'x-retry-after': '95' }) };
    return { ok: true, json: async () => [] };
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  fireEvent.change(await screen.findByLabelText('E-mail'), {
    target: { value: 'ana@homora.test' },
  });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-segura-123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  expect((await screen.findByRole('alert')).textContent).toBe(
    'Muitas tentativas. Tente novamente em 2 min.',
  );
});

it('explains the local password recovery with copyable commands', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url === '/api/auth/status'
        ? { ok: true, json: async () => ({ configured: true, authenticated: false }) }
        : { ok: true, json: async () => [] },
    ),
  );
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Esqueceu a senha?' }));
  expect(await screen.findByText('bun run auth:reset')).toBeTruthy();
  expect(screen.getByText('docker compose exec backend bun scripts/auth-reset.mjs')).toBeTruthy();
  expect(screen.getAllByRole('button', { name: 'Copiar' })).toHaveLength(2);
});

it('does not offer password recovery before the first account exists', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url === '/api/auth/status'
        ? { ok: true, json: async () => ({ configured: false, authenticated: false }) }
        : { ok: true, json: async () => [] },
    ),
  );
  render(<App />);
  await screen.findByLabelText('Nome');
  expect(screen.queryByRole('button', { name: 'Esqueceu a senha?' })).toBeNull();
});

it('warns when Caps Lock is on while typing the password', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url === '/api/auth/status'
        ? { ok: true, json: async () => ({ configured: true, authenticated: false }) }
        : { ok: true, json: async () => [] },
    ),
  );
  render(<App />);
  const password = await screen.findByLabelText('Senha');
  // happy-dom does not track modifier state, so report it from the event itself.
  const capsLock = vi.spyOn(KeyboardEvent.prototype, 'getModifierState');
  capsLock.mockReturnValue(true);
  fireEvent.keyDown(password, { key: 'A' });
  expect((await screen.findByRole('status')).textContent).toContain('Caps Lock está ativado.');
  capsLock.mockReturnValue(false);
  fireEvent.keyUp(password, { key: 'A' });
  await waitFor(() => expect(screen.queryByText('Caps Lock está ativado.')).toBeNull());
  capsLock.mockRestore();
});

it('does not flash the sign-in page while an existing session is being checked', async () => {
  let answer: (value: unknown) => void = () => {};
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/status')
        return new Promise((resolve) => {
          answer = resolve;
        });
      return { ok: true, json: async () => [] };
    }),
  );
  render(<App />);
  // Pending: neither the form nor the example services may be on screen.
  expect(screen.getByRole('status').textContent).toBe('Conectando...');
  expect(screen.queryByLabelText('E-mail')).toBeNull();
  expect(document.querySelector('[data-slot="auth-showcase"]')).toBeNull();
  answer({ ok: true, json: async () => ({ configured: true, authenticated: false }) });
  expect(await screen.findByLabelText('E-mail')).toBeTruthy();
});

it('shows the sign-in page with a retry when the server cannot be reached', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('offline');
    }),
  );
  render(<App />);
  expect(await screen.findByText('Não foi possível conectar ao servidor.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeTruthy();
});

it('checks the password confirmation while creating the first account', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url === '/api/auth/status'
        ? { ok: true, json: async () => ({ configured: false, authenticated: false }) }
        : { ok: true, json: async () => [] },
    ),
  );
  render(<App />);
  fireEvent.change(await screen.findByLabelText('Senha'), {
    target: { value: 'senha-segura-123' },
  });
  expect(screen.getByText('Use pelo menos 8 caracteres.')).toBeTruthy();
  const confirmation = screen.getByLabelText('Confirmar senha');
  // Nothing is flagged before the person leaves the field.
  fireEvent.change(confirmation, { target: { value: 'senha' } });
  expect(screen.queryByRole('alert')).toBeNull();
  fireEvent.blur(confirmation);
  expect((await screen.findByRole('alert')).textContent).toBe('As senhas não coincidem.');
  fireEvent.change(confirmation, { target: { value: 'senha-segura-123' } });
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
});

it('offers the theme toggle next to the language switcher on the sign-in page', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url === '/api/auth/status'
        ? { ok: true, json: async () => ({ configured: true, authenticated: false }) }
        : { ok: true, json: async () => [] },
    ),
  );
  render(<App />);
  await screen.findByLabelText('E-mail');
  expect(screen.getByRole('button', { name: 'Alternar tema' })).toBeTruthy();
});

it('resolves a short address only after completing the recovery-code challenge', async () => {
  window.history.replaceState(null, '', '/go/plex?ignored=1');
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/auth/status')
      return { ok: true, json: async () => ({ configured: true, authenticated: false }) };
    if (url === '/api/auth/sign-in/email')
      return {
        ok: true,
        json: async () => ({ twoFactorRedirect: true, twoFactorMethods: ['totp'] }),
      };
    if (url === '/api/auth/two-factor/verify-backup-code')
      return { ok: true, json: async () => ({}) };
    if (url === '/api/go/plex') return { ok: false, status: 404 };
    return { ok: true, json: async () => [] };
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  fireEvent.change(await screen.findByLabelText('E-mail'), {
    target: { value: 'ana@homora.test' },
  });
  expect(new URLSearchParams(window.location.search).get('returnTo')).toBe('/go/plex');
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-teste' } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  await screen.findByRole('heading', { name: 'Verificação em duas etapas' });
  expect(fetchMock.mock.calls.some(([url]) => url === '/api/go/plex')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Usar um código de recuperação' }));
  fireEvent.change(screen.getByLabelText('Código de recuperação'), {
    target: { value: 'abcde-12345' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));
  expect(await screen.findByText('Endereço curto não encontrado.')).toBeTruthy();
  expect(window.location.pathname).toBe('/go/plex');
});

it.each([
  '/go/plex?x=1',
  '/go/plex#fragment',
  '/go/%70lex',
  '/go/plex\\evil',
  '//evil.test',
  '/go/UPPER',
])('rejects unsafe return destination %s', async (destination) => {
  window.history.replaceState(null, '', `/login?returnTo=${encodeURIComponent(destination)}`);
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/auth/status')
      return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
    return { ok: true, json: async () => [] };
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  await waitFor(() => expect(window.location.pathname).toBe('/'));
  expect(fetchMock.mock.calls.some(([url]) => url.startsWith('/api/go/'))).toBe(false);
});
