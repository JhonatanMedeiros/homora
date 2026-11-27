// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { setLocale } from '@/i18n';
import type { OidcAccount, OidcActions } from '@/hooks/use-oidc';
import { OidcPanel } from './oidc-panel';

beforeEach(() => setLocale('en'));
afterEach(() => {
  cleanup();
  toast.dismiss();
  setLocale('pt-BR');
});

const issuer = 'https://auth.example.home/application/o/homora/';
const empty: OidcAccount = {
  enabled: false,
  name: null,
  redirectUri: null,
  redirectOrigin: window.location.origin,
  identity: null,
  source: 'none',
  environment: false,
  unreadable: false,
  provider: null,
  draft: null,
  disabled: false,
  autoRedirect: false,
  longSession: false,
  health: { status: 'unknown', failure: null, testedAt: null },
};
const saved: OidcAccount = {
  ...empty,
  enabled: true,
  name: 'Authentik',
  redirectUri: `${window.location.origin}/api/auth/callback/oidc-0123456789abcdef`,
  source: 'saved',
  provider: { issuer, clientId: 'homora', name: 'Authentik' },
  identity: { createdAt: '2026-11-13T12:00:00.000Z', current: true },
  health: { status: 'ok', failure: null, testedAt: '2026-11-27T12:00:00.000Z' },
};

function panel(account: OidcAccount, overrides: Partial<OidcActions> = {}) {
  const actions: OidcActions = {
    account,
    loadFailed: false,
    reload: vi.fn(),
    link: vi.fn().mockResolvedValue(true),
    unlink: vi.fn().mockResolvedValue(true),
    save: vi.fn().mockResolvedValue(true),
    setPreferences: vi.fn().mockResolvedValue(true),
    discardDraft: vi.fn().mockResolvedValue(true),
    remove: vi.fn().mockResolvedValue(true),
    test: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
  const onChanged = vi.fn();
  render(<OidcPanel oidc={actions} onChanged={onChanged} />);
  return { actions, onChanged };
}
const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

it('saves a draft until the client ID and secret are filled in', async () => {
  const { actions } = panel(empty);
  type('Issuer URL', issuer);
  expect(screen.getByRole('button', { name: 'Save draft' })).toBeTruthy();
  expect(
    await screen.findByText(
      new RegExp(`${window.location.origin}/api/auth/callback/oidc-[0-9a-f]{16}`),
    ),
  ).toBeTruthy();
  type('Client ID', 'homora');
  type('Client secret', 'top-secret');
  type('Current password', 'secret-password');
  click('Save and test');
  await waitFor(() =>
    expect(actions.save).toHaveBeenCalledWith({
      password: 'secret-password',
      issuer,
      clientId: 'homora',
      clientSecret: 'top-secret',
    }),
  );
});

it('keeps the saved secret for the same issuer and asks to confirm a new one', async () => {
  const save = vi
    .fn()
    .mockResolvedValueOnce({ error: 'confirm', code: 'oidc-confirm-issuer' })
    .mockResolvedValue(true);
  const { onChanged } = panel(saved, { save });
  click('Edit');
  expect(screen.getByText('Leave empty to keep the saved secret.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Save and test' })).toBeTruthy();
  type('Issuer URL', 'https://next.example.home/');
  // Another issuer never receives the saved secret.
  expect(screen.getByRole('button', { name: 'Save draft' })).toBeTruthy();
  type('Client secret', 'new-secret');
  type('Current password', 'secret-password');
  click('Save and test');
  expect(await screen.findByText(/removes the linked identity/)).toBeTruthy();
  click('Remove the link and save');
  await waitFor(() =>
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ confirmIssuerChange: true })),
  );
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
});

it('says why the provider is not working and that the button is hidden', () => {
  panel({
    ...saved,
    identity: null,
    health: { status: 'failing', failure: 'signing', testedAt: null },
  });
  expect(screen.getByText(/publishes no signing key/)).toBeTruthy();
  expect(screen.getByText(/hides the provider button/)).toBeTruthy();
  expect(
    (screen.getByRole('switch', { name: 'Automatic redirect' }) as HTMLButtonElement).disabled,
  ).toBe(true);
});

it('asks for the password to change the sign-in behaviour', async () => {
  const { actions } = panel(saved);
  expect(
    screen.queryByLabelText('Current password', { selector: '#oidc-behaviour-password' }),
  ).toBe(null);
  fireEvent.click(screen.getByRole('switch', { name: 'Automatic redirect' }));
  expect(screen.getByText(`${window.location.origin}/login?local=1`)).toBeTruthy();
  fireEvent.change(document.querySelector('#oidc-behaviour-password')!, {
    target: { value: 'secret-password' },
  });
  click('Save behaviour');
  await waitFor(() =>
    expect(actions.setPreferences).toHaveBeenCalledWith({
      password: 'secret-password',
      autoRedirect: true,
      longSession: false,
    }),
  );
});

it('removes the configuration only after the password is typed', async () => {
  const { actions, onChanged } = panel({ ...saved, environment: true });
  click('Remove configuration');
  expect(screen.getByText(/variables apply again/)).toBeTruthy();
  const form = screen.getByRole('form', { name: 'Remove configuration' });
  fireEvent.change(form.querySelector('input')!, { target: { value: 'secret-password' } });
  fireEvent.submit(form);
  await waitFor(() => expect(actions.remove).toHaveBeenCalledWith('secret-password'));
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
});

it('offers to complete or discard a draft beside the provider in use', () => {
  panel({
    ...saved,
    draft: {
      issuer: 'https://next.example.home/',
      clientId: '',
      name: '',
      hasSecret: false,
      redirectUri: `${window.location.origin}/api/auth/callback/oidc-fedcba9876543210`,
    },
  });
  expect(screen.getByText(/does not change until it is completed/)).toBeTruthy();
  click('Complete draft');
  expect((screen.getByLabelText('Issuer URL') as HTMLInputElement).value).toBe(
    'https://next.example.home/',
  );
});

it('says that a draft is being completed', async () => {
  const { actions } = panel({
    ...empty,
    draft: { issuer, clientId: 'homora', name: '', hasSecret: true, redirectUri: 'x' },
  });
  type('Current password', 'secret-password');
  click('Save and test');
  await waitFor(() =>
    expect(actions.save).toHaveBeenCalledWith(expect.objectContaining({ fromDraft: true })),
  );
});

it('still removes a link when no provider is configured', () => {
  panel({ ...empty, identity: { createdAt: '2026-11-13T12:00:00.000Z', current: false } });
  expect(screen.getByRole('button', { name: 'Remove the link' })).toBeTruthy();
});

it('offers removal when only an unreadable draft was saved', () => {
  panel({ ...empty, unreadable: true });
  expect(screen.getByRole('button', { name: 'Remove configuration' })).toBeTruthy();
});

it('explains where a provider comes from and which address it returns to', () => {
  panel({
    ...saved,
    source: 'environment',
    environment: true,
    redirectOrigin: 'https://homora.example.home',
  });
  expect(screen.getByText(/Defined by the HOMORA_OIDC_\* variables/)).toBeTruthy();
  expect(screen.getByText(/returns to https:\/\/homora\.example\.home/)).toBeTruthy();
  // Nothing saved here to remove.
  expect(screen.queryByRole('button', { name: 'Remove configuration' })).toBe(null);
});
