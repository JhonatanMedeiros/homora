// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { setLocale } from '@/i18n';
import { TwoFactorForm } from './two-factor-form';

beforeEach(() => setLocale('en'));

afterEach(() => {
  cleanup();
  toast.dismiss();
  vi.unstubAllGlobals();
  setLocale('en');
});

const URI = 'otpauth://totp/Homora:admin%40homora.test?secret=JBSWY3DPEHPK3PXP&issuer=Homora';
const CODES = ['aaaaa-11111', 'bbbbb-22222'];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function stub(handler: (path: string, body: Record<string, string>) => Response) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
    handler(url, JSON.parse(String(init?.body ?? '{}'))),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

it('is off by default, asks for the password, then a valid code before it turns on', async () => {
  const onChanged = vi.fn();
  const fetchMock = stub((path, body) => {
    if (path.endsWith('/enable'))
      return body.password === 'right-password'
        ? json({ totpURI: URI, backupCodes: CODES })
        : json({ code: 'invalid-current-password' }, 400);
    if (path.endsWith('/verify-totp'))
      return body.code === '123456' ? json({}) : json({ code: 'two-factor-invalid-code' }, 401);
    return json({}, 404);
  });
  render(<TwoFactorForm enabled={false} onChanged={onChanged} />);
  expect(screen.getByText('Off')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));

  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'nope-nope' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect((await screen.findByRole('alert')).textContent).toBe('The current password is incorrect.');
  expect(screen.queryByRole('img')).toBeNull();

  fireEvent.change(screen.getByLabelText('Current password'), {
    target: { value: 'right-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(
    await screen.findByRole('img', { name: 'QR code for your authenticator app' }),
  ).toBeTruthy();
  expect((screen.getByLabelText('Setup key') as HTMLInputElement).value).toBe('JBSWY3DPEHPK3PXP');
  // Nothing is on until the code is confirmed, and the recovery codes are not shown yet.
  expect(onChanged).not.toHaveBeenCalled();
  expect(screen.queryByText(CODES[0]!)).toBeNull();

  fireEvent.change(screen.getByLabelText('Code from the app'), { target: { value: '000000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and turn on' }));
  expect((await screen.findByRole('alert')).textContent).toBe('The code is not valid.');
  expect(onChanged).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText('Code from the app'), { target: { value: '123 456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and turn on' }));
  expect(await screen.findByText(CODES[0]!)).toBeTruthy();
  expect(onChanged).toHaveBeenCalledWith(true);
  const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
  expect(bodies.at(-1)).toEqual({ code: '123456' });

  // The codes disappear once acknowledged.
  fireEvent.click(screen.getByRole('button', { name: 'I saved the codes' }));
  expect(screen.queryByText(CODES[0]!)).toBeNull();
});

it('turns off and regenerates the recovery codes only with the password', async () => {
  const onChanged = vi.fn();
  const fetchMock = stub((path, body) => {
    if (body.password !== 'right-password') return json({ code: 'invalid-current-password' }, 400);
    return path.endsWith('/generate-backup-codes') ? json({ backupCodes: CODES }) : json({});
  });
  render(<TwoFactorForm enabled onChanged={onChanged} />);
  expect(screen.getByText('On')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Generate new codes' }));
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'wrong-pass' } });
  fireEvent.click(screen.getByRole('button', { name: 'Generate new codes' }));
  await screen.findByRole('alert');
  expect(screen.queryByText(CODES[0]!)).toBeNull();
  fireEvent.change(screen.getByLabelText('Current password'), {
    target: { value: 'right-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Generate new codes' }));
  expect(await screen.findByText(CODES[1]!)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'I saved the codes' }));

  fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'wrong-pass' } });
  fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
  await screen.findByRole('alert');
  expect(onChanged).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Current password'), {
    target: { value: 'right-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
  await waitFor(() => expect(onChanged).toHaveBeenCalledWith(false));
  expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/two-factor/disable'))).toBe(
    true,
  );
});

it('explains how to recover when the app and the codes are lost', () => {
  render(<TwoFactorForm enabled onChanged={vi.fn()} />);
  expect(screen.getByText(/auth:reset --two-factor-only/)).toBeTruthy();
});
