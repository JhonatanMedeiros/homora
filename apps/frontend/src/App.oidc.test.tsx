// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

it('is usable again when the browser restores the page after Back from the provider', async () => {
  stub({ oidc: linked });
  render(<App />);
  const button = await screen.findByRole('button', { name: 'Sign in with Authentik' });
  fireEvent.click(button);
  await vi.waitFor(() => expect(assign).toHaveBeenCalled());
  expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent(window, Object.assign(new Event('pageshow'), { persisted: true }));
  await vi.waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
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

it.each([
  [
    'failed',
    'The identity was not linked. Nothing changed; check the provider settings and try again.',
  ],
  [
    'denied',
    'The provider did not authorize the link. Nothing changed; try again when you are ready.',
  ],
])(
  'tells a signed-in person that linking (%s) did not happen, not that sign-in failed',
  async (reason, message) => {
    window.history.replaceState(null, '', `/account?error=${reason}`);
    stub({ oidc: linked, signedIn: true });
    render(<App />);
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText(/sign-in with the provider|authorize the sign-in/)).toBeNull();
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

const automatic = { ...linked, autoRedirect: true };
const clearRedirectMemory = () => {
  localStorage.removeItem('homora.signed-out');
  sessionStorage.removeItem('homora.oidc-redirected');
};

describe('automatic redirect', () => {
  beforeEach(clearRedirectMemory);
  afterEach(clearRedirectMemory);
  const loginBody = (fetchMock: ReturnType<typeof stub>) =>
    fetchMock.mock.calls
      .map((call) => call as unknown as [string, RequestInit?])
      .filter(([url]) => url === '/api/auth/oidc/login')
      .map(([, init]) => JSON.parse(String(init?.body)) as object);

  it('opens the provider on arrival, once', async () => {
    const fetchMock = stub({ oidc: automatic });
    render(<App />);
    expect(await screen.findByText('Going to Authentik…')).toBeTruthy();
    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(loginBody(fetchMock)).toEqual([{ auto: true }]);
    cleanup();
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Sign in with Authentik' })).toBeTruthy();
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it.each(['/login?local=1', '/login?error=failed'])('stays on %s', async (address) => {
    window.history.replaceState(null, '', address);
    const fetchMock = stub({ oidc: automatic });
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Sign in with Authentik' })).toBeTruthy();
    expect(loginBody(fetchMock)).toEqual([]);
  });

  it('does not leave by itself when the browser keeps nothing', async () => {
    const real = window.sessionStorage;
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get: () => {
        throw new Error('blocked');
      },
    });
    try {
      const fetchMock = stub({ oidc: automatic });
      render(<App />);
      expect(await screen.findByRole('button', { name: 'Sign in with Authentik' })).toBeTruthy();
      expect(loginBody(fetchMock)).toEqual([]);
    } finally {
      Object.defineProperty(window, 'sessionStorage', { configurable: true, value: real });
    }
  });

  it('stays on the sign-in page after signing out', async () => {
    localStorage.setItem('homora.signed-out', '1');
    const fetchMock = stub({ oidc: automatic });
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Sign in with Authentik' })).toBeTruthy();
    expect(loginBody(fetchMock)).toEqual([]);
  });

  it('shows the sign-in page when the provider does not answer', async () => {
    stub({
      oidc: automatic,
      login: () => new Response(JSON.stringify({ code: 'oidc-unavailable' }), { status: 503 }),
    });
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Sign in with Authentik' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBe(null);
    expect(assign).not.toHaveBeenCalled();
  });

  it('sends the "keep me signed in" choice with the provider button', async () => {
    const fetchMock = stub({ oidc: linked });
    render(<App />);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Keep me signed in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Authentik' }));
    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(loginBody(fetchMock)).toEqual([{ rememberMe: true }]);
  });
});
