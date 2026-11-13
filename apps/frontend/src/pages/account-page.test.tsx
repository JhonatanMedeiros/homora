// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { setLocale } from '@/i18n';
import type { Profile } from '@/features/account/account-model';
import { AccountPage } from './account-page';

beforeEach(() => setLocale('en'));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setLocale('en');
});

const profile: Profile = { name: 'Ana Souza', email: 'ana@homora.test', twoFactorEnabled: false };
const passkey = {
  id: 'p1',
  name: 'Notebook',
  createdAt: null,
  deviceType: 'singleDevice',
  backedUp: false,
  transports: [],
};

const now = Date.now();
const activity = {
  nextBefore: null,
  events: [
    {
      id: 2,
      createdAt: now - 60 * 60 * 1000,
      kind: 'access',
      action: 'login',
      outcome: 'failure',
      actor: { type: 'anonymous', name: null },
      detail: '3',
      ipAddress: '10.0.0.9',
      proposalId: null,
    },
    {
      id: 1,
      createdAt: now - 3 * 24 * 60 * 60 * 1000,
      kind: 'access',
      action: 'login',
      outcome: 'success',
      actor: { type: 'user', name: 'Ana' },
      detail: null,
      ipAddress: '10.0.0.2',
      proposalId: null,
    },
  ],
};

function mockApi(passkeys: unknown[] = [passkey]) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/account/sessions') return new Response('[]');
    if (url === '/api/auth/status')
      return new Response(JSON.stringify({ passkey: { origins: [] } }));
    if (url === '/api/auth/passkey/list-user-passkeys')
      return new Response(JSON.stringify(passkeys));
    if (url.startsWith('/api/activity')) return new Response(JSON.stringify(activity));
    if (url === '/api/account' && init?.method === 'PATCH')
      return new Response(
        JSON.stringify({ ...profile, name: JSON.parse(String(init.body)).name as string }),
      );
    if (url === '/api/account/email' && init?.method === 'PATCH')
      return new Response(
        JSON.stringify({ ...profile, email: JSON.parse(String(init.body)).email as string }),
      );
    return new Response('{}');
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage(onProfileChange = vi.fn()) {
  render(
    <MemoryRouter>
      <AccountPage profile={profile} failed={false} onProfileChange={onProfileChange} />
    </MemoryRouter>,
  );
  return onProfileChange;
}

it('summarises how protected the account is and offers the next step', async () => {
  mockApi();
  renderPage();
  expect(await screen.findByText('Account protection')).toBeTruthy();
  expect(screen.getByText('Ana Souza')).toBeTruthy();
  expect(screen.getByText('ana@homora.test')).toBeTruthy();
  // Password and one passkey are active, two-step verification is off.
  expect(screen.getByRole('img', { name: '2 of 3 protections active' })).toBeTruthy();
  expect(await screen.findByText('1 registered')).toBeTruthy();
  expect(screen.getByText('Good, can improve')).toBeTruthy();
});

it('hides passkeys from the summary where they cannot be used and none exist', async () => {
  mockApi([]);
  renderPage();
  expect(await screen.findByText('Account protection')).toBeTruthy();
  await waitFor(() =>
    expect(screen.getByRole('img', { name: '1 of 2 protections active' })).toBeTruthy(),
  );
  expect(screen.getByText('Basic')).toBeTruthy();
});

it('opens each form in a dialog with its own title instead of a long page', async () => {
  mockApi();
  renderPage();
  await screen.findByText('Account protection');
  expect(screen.queryByLabelText('Current password')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
  const dialog = await screen.findByRole('dialog', { name: 'Password' });
  expect(within(dialog).getByLabelText('Current password')).toBeTruthy();
  // The dialog supplies the title, so the form does not repeat it as a section heading.
  expect(within(dialog).getAllByRole('heading', { name: 'Password' })).toHaveLength(1);
});

it('starts two-step setup from the summary and keeps the dialog open while the QR code is shown', async () => {
  const fetchMock = mockApi();
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/auth/two-factor/enable')
      return new Response(
        JSON.stringify({
          totpURI: 'otpauth://totp/Homora:ana?secret=ABCDEFGH&issuer=Homora',
          backupCodes: ['aaaaa-11111'],
        }),
      );
    if (url === '/api/account/sessions') return new Response('[]');
    if (url === '/api/auth/status')
      return new Response(JSON.stringify({ passkey: { origins: [] } }));
    if (url === '/api/auth/passkey/list-user-passkeys') return new Response('[]');
    if (url.startsWith('/api/activity')) return new Response(JSON.stringify(activity));
    return new Response('{}');
  });
  renderPage();
  await screen.findByText('Account protection');
  const summary = screen
    .getByText('Account protection')
    .closest('[data-slot="card"]') as HTMLElement;
  fireEvent.click(within(summary).getByRole('button', { name: 'Turn on' }));
  const dialog = await screen.findByRole('dialog', { name: 'Two-step verification' });
  fireEvent.change(within(dialog).getByLabelText('Current password'), {
    target: { value: 'senha-segura-123' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));
  expect(await within(dialog).findByLabelText('Setup key')).toBeTruthy();
  // The QR code is shown only once, so the dialog drops its close button and ignores Escape.
  await waitFor(() => expect(within(dialog).queryByRole('button', { name: 'Close' })).toBeNull());
  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(screen.getByRole('dialog', { name: 'Two-step verification' })).toBeTruthy();
});

it('edits the name in a dialog and closes it once saved', async () => {
  const fetchMock = mockApi();
  const onChange = renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
  const dialog = await screen.findByRole('dialog', { name: 'Profile' });
  fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Ana Maria' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
  await waitFor(() =>
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ana Maria' })),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/account',
    expect.objectContaining({ method: 'PATCH' }),
  );
});

it('changes the sign-in email only after asking for the password', async () => {
  const fetchMock = mockApi();
  const onChange = renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
  const dialog = await screen.findByRole('dialog', { name: 'Profile' });
  expect(within(dialog).queryByLabelText('Current password')).toBeNull();
  fireEvent.change(within(dialog).getByLabelText('Email'), { target: { value: 'novo@casa.test' } });
  const save = within(dialog).getByRole('button', { name: 'Save changes' }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  fireEvent.change(within(dialog).getByLabelText('Current password'), {
    target: { value: 'senha-segura-123' },
  });
  expect(save.disabled).toBe(false);
  fireEvent.click(save);
  await waitFor(() =>
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ email: 'novo@casa.test' })),
  );
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/account/email',
    expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ email: 'novo@casa.test', currentPassword: 'senha-segura-123' }),
    }),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('shows recent sign-ins with the failed attempts of the last day and a link to all activity', async () => {
  mockApi();
  renderPage();
  const section = (await screen.findByText('Recent sign-ins')).closest('section') as HTMLElement;
  expect(
    await within(section).findByText('1 failed sign-in attempt in the last 24 hours'),
  ).toBeTruthy();
  expect(within(section).getByText(/10\.0\.0\.9/)).toBeTruthy();
  expect(
    within(section).getByRole('link', { name: 'View all activity' }).getAttribute('href'),
  ).toBe('/manage/activity');
});
