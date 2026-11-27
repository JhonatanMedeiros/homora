// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { setLocale } from '@/i18n';
import { navigation, resetOidcReturn } from '@/hooks/use-oidc';
import { App } from './App';

const assign = vi.spyOn(navigation, 'go').mockImplementation(() => {});

beforeEach(() => {
  setLocale('en');
  resetOidcReturn();
  assign.mockClear();
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  window.history.replaceState(null, '', '/');
  resetOidcReturn();
  vi.unstubAllGlobals();
  setLocale('pt-BR');
});

type Options = {
  oidc?: object;
  login?: () => Response;
};
function stub({ oidc, login }: Options = {}) {
  const authenticated = false;
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/auth/status')
      return new Response(
        JSON.stringify({
          configured: true,
          authenticated,
          passkey: { origins: [] },
          ...(oidc ? { oidc } : {}),
        }),
      );
    if (url === '/api/auth/oidc/login')
      return (
        login?.() ?? new Response(JSON.stringify({ url: 'https://idp.example.test/authorize?x=1' }))
      );
    return new Response('[]');
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const linked = { enabled: true, name: 'Authentik', linked: true };

it('offers the provider only when it is configured and an identity is linked', async () => {
  stub();
  render(<App />);
  await screen.findByLabelText('Email');
  expect(screen.queryByRole('button', { name: /Sign in with/ })).toBeNull();
  cleanup();
  stub({ oidc: { enabled: true, name: 'Authentik', linked: false } });
  render(<App />);
  await screen.findByLabelText('Email');
  expect(screen.queryByRole('button', { name: /Sign in with Authentik/ })).toBeNull();
});

it('sends the browser to the provider with the “keep me signed in” choice', async () => {
  const fetchMock = stub({ oidc: linked });
  render(<App />);
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Keep me signed in' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with Authentik' }));
  await vi.waitFor(() =>
    expect(assign).toHaveBeenCalledWith('https://idp.example.test/authorize?x=1'),
  );
  const call = fetchMock.mock.calls.find(([url]) => url === '/api/auth/oidc/login') as unknown as [
    string,
    { body: string },
  ];
  expect(JSON.parse(call[1].body)).toEqual({ rememberMe: true });
});

it('keeps the password form and shows the reason when the provider cannot be reached', async () => {
  stub({
    oidc: linked,
    login: () => new Response(JSON.stringify({ code: 'oidc-unavailable' }), { status: 503 }),
  });
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Sign in with Authentik' }));
  expect((await screen.findByRole('alert')).textContent).toBe(
    'The sign-in provider is not reachable. Use your password instead.',
  );
  expect(assign).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Email')).toBeTruthy();
});

it('tells a linked identity once and cleans the address', async () => {
  window.history.replaceState(null, '', '/?oidc=linked');
  stub({ oidc: linked });
  render(<App />);
  await screen.findByLabelText('Email');
  expect(
    await screen.findByText('Identity linked. You can now sign in with the provider.'),
  ).toBeTruthy();
  expect(window.location.search).not.toContain('oidc');
});

it.each([
  ['denied', 'The provider did not authorize the sign-in. Try again or use your password.'],
  ['failed', 'The sign-in with the provider was not accepted. Try again or use your password.'],
])(
  'explains a failed return (%s) on the sign-in page and cleans the address',
  async (reason, message) => {
    window.history.replaceState(null, '', `/login?error=${reason}`);
    stub({ oidc: linked });
    render(<App />);
    expect((await screen.findByRole('alert')).textContent).toBe(message);
    expect(window.location.search).toBe('');
  },
);

it('ignores unknown error values in the address', async () => {
  window.history.replaceState(null, '', '/login?error=<script>');
  stub({ oidc: linked });
  render(<App />);
  await screen.findByLabelText('Email');
  expect(screen.queryByRole('alert')).toBeNull();
});
