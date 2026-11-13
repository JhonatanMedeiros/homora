// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { setLocale } from '@/i18n';
import { App } from './App';

const browser = vi.hoisted(() => ({ supported: true, startAuthentication: vi.fn() }));
vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: () => browser.supported,
  startAuthentication: browser.startAuthentication,
  startRegistration: vi.fn(),
}));

beforeEach(() => {
  setLocale('en');
  browser.supported = true;
  browser.startAuthentication.mockReset();
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
  setLocale('pt-BR');
});

function stub(
  origins: string[],
  verify: () => Response = () => new Response('{"user":{"id":"u"}}'),
) {
  let authenticated = false;
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/auth/status')
      return new Response(
        JSON.stringify({ configured: true, authenticated, passkey: { origins } }),
      );
    if (url === '/api/auth/passkey/generate-authenticate-options')
      return new Response(JSON.stringify({ challenge: 'abc' }));
    if (url === '/api/auth/passkey/verify-authentication') {
      const response = verify();
      authenticated = response.ok;
      return response;
    }
    return new Response('[]');
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

it('signs in with a passkey, passing the "keep me signed in" choice, without asking for a code', async () => {
  browser.startAuthentication.mockResolvedValue({ id: 'credential' });
  const fetchMock = stub([window.location.origin]);
  render(<App />);
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Keep me signed in' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with a passkey' }));
  expect(await screen.findByRole('heading', { name: /Everything in its place/ })).toBeTruthy();
  const verify = fetchMock.mock.calls.find(
    ([url]) => url === '/api/auth/passkey/verify-authentication',
  ) as unknown as [string, { body: string }];
  expect(JSON.parse(verify[1].body)).toEqual({ response: { id: 'credential' }, rememberMe: true });
  expect(screen.queryByText('Two-step verification')).toBeNull();
});

it('keeps the password form working and shows a message when the passkey is refused', async () => {
  browser.startAuthentication.mockResolvedValue({ id: 'credential' });
  stub(
    [window.location.origin],
    () => new Response(JSON.stringify({ code: 'passkey-sign-in-failed' }), { status: 401 }),
  );
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Sign in with a passkey' }));
  expect((await screen.findByRole('alert')).textContent).toBe('The passkey was not accepted.');
  expect(screen.getByLabelText('Email')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
});

it('tells a cancelled prompt apart from a refusal', async () => {
  browser.startAuthentication.mockRejectedValue(
    Object.assign(new Error('dismissed'), { name: 'NotAllowedError' }),
  );
  stub([window.location.origin]);
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Sign in with a passkey' }));
  expect((await screen.findByRole('alert')).textContent).toBe(
    'The request was cancelled or timed out. Try again.',
  );
});

it('hides the passkey button and explains when the address or browser cannot use passkeys', async () => {
  stub(['https://homora.example.home']);
  render(<App />);
  expect(await screen.findByText(/Passkeys are not available at this address/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Sign in with a passkey' })).toBeNull();
  cleanup();

  browser.supported = false;
  stub([window.location.origin]);
  render(<App />);
  expect(await screen.findByText('This browser does not support passkeys.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Sign in with a passkey' })).toBeNull();
});
