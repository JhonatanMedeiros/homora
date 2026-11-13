// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { setLocale } from '@/i18n';
import { PasskeysForm } from './passkeys-form';

const browser = vi.hoisted(() => ({
  supported: true,
  startRegistration: vi.fn(),
  startAuthentication: vi.fn(),
}));
vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: () => browser.supported,
  startRegistration: browser.startRegistration,
  startAuthentication: browser.startAuthentication,
}));

beforeEach(() => {
  setLocale('en');
  browser.supported = true;
  browser.startRegistration.mockReset();
});

afterEach(() => {
  cleanup();
  toast.dismiss();
  vi.unstubAllGlobals();
  setLocale('en');
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const passkey = (id: string, name: string | null, backedUp = true) => ({
  id,
  name,
  createdAt: '2026-11-13T12:00:00.000Z',
  deviceType: 'multiDevice',
  backedUp,
  transports: ['internal'],
});

function stub(
  state: { list: ReturnType<typeof passkey>[]; origins?: string[] },
  handler: (path: string, body: Record<string, unknown>) => Response | undefined = () => undefined,
) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    const custom = handler(url, body);
    if (custom) return custom;
    if (url === '/api/auth/status')
      return json({
        configured: true,
        authenticated: true,
        passkey: { origins: state.origins ?? [window.location.origin] },
      });
    if (url.endsWith('/list-user-passkeys')) return json(state.list);
    return json({}, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

it('explains why passkeys are unavailable on another address instead of offering them', async () => {
  stub({ list: [], origins: ['https://homora.example.home'] });
  render(<PasskeysForm twoFactorEnabled={false} />);
  expect(await screen.findByText(/only work on the address configured/)).toBeTruthy();
  expect(screen.getByText(/https:\/\/homora\.example\.home/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Add a passkey' })).toBeNull();
});

it('explains when the browser has no WebAuthn support', async () => {
  browser.supported = false;
  stub({ list: [] });
  render(<PasskeysForm twoFactorEnabled={false} />);
  expect(await screen.findByText('This browser does not support passkeys.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Add a passkey' })).toBeNull();
});

it('adds a passkey after the password and the device prompt, and lists several', async () => {
  browser.startRegistration.mockResolvedValue({ id: 'credential' });
  const fetchMock = stub({ list: [passkey('p1', 'Laptop')] }, (path, body) => {
    if (path.endsWith('/generate-register-options'))
      return body.password === 'right-password'
        ? json({ challenge: 'abc' })
        : json({ code: 'invalid-current-password' }, 400);
    if (path.endsWith('/verify-registration')) return json(passkey('p2', 'Phone', false));
    return undefined;
  });
  render(<PasskeysForm twoFactorEnabled />);
  expect(await screen.findByText('Laptop')).toBeTruthy();
  // The two-step note says a passkey is a complete sign-in on its own.
  expect(screen.getByText(/does not ask for the authenticator code/)).toBeTruthy();

  fireEvent.click(await screen.findByRole('button', { name: 'Add a passkey' }));
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' Phone ' } });
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'wrong-pass' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect((await screen.findByRole('alert')).textContent).toBe('The current password is incorrect.');
  expect(browser.startRegistration).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText('Current password'), {
    target: { value: 'right-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(await screen.findByText('Phone')).toBeTruthy();
  expect(screen.getByText('Laptop')).toBeTruthy();
  const verify = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/verify-registration'));
  expect(JSON.parse(String(verify?.[1]?.body))).toEqual({
    response: { id: 'credential' },
    name: 'Phone',
  });
});

it('reports a cancelled prompt and a duplicate authenticator in plain words', async () => {
  stub({ list: [] }, (path) =>
    path.endsWith('/generate-register-options') ? json({ challenge: 'abc' }) : undefined,
  );
  render(<PasskeysForm twoFactorEnabled={false} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Add a passkey' }));
  fireEvent.change(screen.getByLabelText('Current password'), {
    target: { value: 'any-password' },
  });

  browser.startRegistration.mockRejectedValueOnce(
    Object.assign(new Error('dismissed'), { name: 'NotAllowedError' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect((await screen.findByRole('alert')).textContent).toBe(
    'The request was cancelled or timed out. Try again.',
  );

  browser.startRegistration.mockRejectedValueOnce(
    Object.assign(new Error('dup'), { code: 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toBe(
      'This authenticator already has a passkey for Homora.',
    ),
  );
});

it('renames a passkey and removes one only with the password, warning about the last one', async () => {
  const onChanged = vi.fn();
  const fetchMock = stub({ list: [passkey('p1', 'Laptop')] }, (path, body) => {
    if (path.endsWith('/update-passkey')) return json(passkey('p1', String(body.name)));
    if (path.endsWith('/delete-passkey'))
      return body.password === 'right-password'
        ? json({ status: true })
        : json({ code: 'invalid-current-password' }, 400);
    return undefined;
  });
  render(<PasskeysForm twoFactorEnabled={false} onChanged={onChanged} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Rename: Laptop' }));
  fireEvent.change(screen.getByLabelText('New name for Laptop'), { target: { value: 'Desk' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('Desk')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Remove: Desk' }));
  expect(screen.getByText('Remove Desk?')).toBeTruthy();
  expect(screen.getByText(/last passkey/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'wrong-pass' } });
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
  expect((await screen.findByRole('alert')).textContent).toBe('The current password is incorrect.');
  expect(onChanged).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Current password'), {
    target: { value: 'right-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  expect(await screen.findByText('No passkeys yet.')).toBeTruthy();
  expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/delete-passkey'))).toBe(true);
});

it('explains how to recover from a lost device', async () => {
  stub({ list: [] });
  render(<PasskeysForm twoFactorEnabled={false} />);
  expect(await screen.findByText(/auth:reset --passkeys-only/)).toBeTruthy();
});
