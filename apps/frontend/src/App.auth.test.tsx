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
  fireEvent.change(screen.getByLabelText('Código de autenticação'), {
    target: { value: '000000' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));
  expect((await screen.findByRole('alert')).textContent).toBe('O código não é válido.');
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
  fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));
  expect(await screen.findByText('Bem-vindo de volta.')).toBeTruthy();
  expect((await screen.findByRole('alert')).textContent).toContain('expirou');
});
