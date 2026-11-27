// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { setLocale } from '@/i18n';
import type { OidcAccount } from '@/hooks/use-oidc';
import { OidcForm } from './oidc-form';

beforeEach(() => setLocale('en'));
afterEach(() => {
  cleanup();
  toast.dismiss();
  setLocale('en');
});

const notLinked: OidcAccount = {
  enabled: true,
  name: 'Authentik',
  redirectUri: 'https://homora.example.home/api/auth/callback/oidc-0123456789abcdef',
  redirectOrigin: 'https://homora.example.home',
  identity: null,
  source: 'saved',
  environment: false,
  unreadable: false,
  provider: {
    issuer: 'https://auth.example.home/application/o/homora/',
    clientId: 'homora',
    name: 'Authentik',
  },
  draft: null,
  disabled: false,
  autoRedirect: false,
  longSession: false,
  health: { status: 'ok', failure: null, testedAt: null },
};
const identity = { createdAt: '2026-11-13T12:00:00.000Z', current: true };

it('asks for the password before leaving for the provider', async () => {
  const onLink = vi.fn().mockResolvedValue(true);
  render(<OidcForm account={notLinked} onLink={onLink} onUnlink={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Current password'), {
    target: { value: 'secret-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Continue to Authentik' }));
  await waitFor(() => expect(onLink).toHaveBeenCalledWith('secret-password'));
});

it('shows a refusal such as a wrong password', async () => {
  const onLink = vi.fn().mockResolvedValue({ error: 'The current password is incorrect.' });
  render(<OidcForm account={notLinked} onLink={onLink} onUnlink={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'wrong-wrong' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue to Authentik' }));
  expect((await screen.findByRole('alert')).textContent).toBe('The current password is incorrect.');
});

it('shows the link without its subject and removes it with the password', async () => {
  const onUnlink = vi.fn().mockResolvedValue(true);
  const onChanged = vi.fn();
  render(
    <OidcForm
      account={{ ...notLinked, identity }}
      onLink={vi.fn()}
      onUnlink={onUnlink}
      onChanged={onChanged}
    />,
  );
  expect(screen.getByText('Authentik · Linked')).toBeTruthy();
  expect(screen.getByText(/does not ask for the authenticator code/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Current password'), {
    target: { value: 'secret-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Remove the link' }));
  await waitFor(() => expect(onUnlink).toHaveBeenCalledWith('secret-password'));
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
});

it('says when the link belongs to a provider that is no longer configured', () => {
  render(
    <OidcForm
      account={{ ...notLinked, identity: { ...identity, current: false } }}
      onLink={vi.fn()}
      onUnlink={vi.fn()}
    />,
  );
  expect(screen.getByText(/no longer configured and cannot sign in/)).toBeTruthy();
});

it('explains why an identity cannot be linked and keeps the button off', () => {
  render(
    <OidcForm
      account={notLinked}
      onLink={vi.fn()}
      onUnlink={vi.fn()}
      linkBlocked="Fix the provider first."
    />,
  );
  expect(screen.getByText('Fix the provider first.')).toBeTruthy();
  expect(
    (screen.getByRole('button', { name: 'Continue to Authentik' }) as HTMLButtonElement).disabled,
  ).toBe(true);
});
