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
  signedIn?: boolean;
};
function stub({ oidc, login, signedIn = false }: Options = {}) {
  let authenticated = signedIn;
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
    if (url === '/api/auth/sign-out') {
      authenticated = false;
      return new Response('{}');
    }
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

it('sends the browser to the provider', async () => {
  stub({ oidc: linked });
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Sign in with Authentik' }));
  await vi.waitFor(() =>
    expect(assign).toHaveBeenCalledWith('https://idp.example.test/authorize?x=1'),
  );
});

it('still offers the provider right after signing out, without a reload', async () => {
  stub({ oidc: linked, signedIn: true });
  render(<App />);
  fireEvent.pointerDown(await screen.findByRole('button', { name: /Account menu/ }), { button: 0 });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
  expect(await screen.findByRole('button', { name: 'Sign in with Authentik' })).toBeTruthy();
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
