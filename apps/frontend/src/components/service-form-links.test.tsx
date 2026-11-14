// @vitest-environment happy-dom
import { useState } from 'react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { LinkColor } from '@homora/shared';
import { setLocale } from '@/i18n';
import type { LinkTypesApi } from '@/hooks/use-link-types';
import { emptyLinkDraft, type LinkDraft, type LinkTypeWithUses } from '@/lib/service-links';
import { ServiceFormLinks } from './service-form-links';

beforeAll(() => {
  // cmdk measures and scrolls items; happy-dom has neither.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= () => {};
});
beforeEach(() => setLocale('en'));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const lan: LinkTypeWithUses = { id: 1, name: 'LAN', color: 'green', uses: 2 };

function setup(initial: LinkDraft[] = [], types: LinkTypeWithUses[] = [lan]) {
  const api = {
    types,
    create: vi.fn(async (name: string, color: LinkColor) => ({
      type: { id: 9, name, color, uses: 0 },
    })),
    update: vi.fn(async (id: number, patch: { name?: string; color?: LinkColor }) => ({
      type: { id, name: patch.name ?? 'x', color: patch.color ?? 'neutral', uses: 0 },
    })),
    remove: vi.fn(async () => ({ ok: true as const })),
  } satisfies LinkTypesApi;
  let latest: LinkDraft[] = initial;
  function Harness() {
    const [value, setValue] = useState(initial);
    latest = value;
    return (
      <form>
        <ServiceFormLinks
          value={value}
          onChange={(next) => {
            latest = next;
            setValue(next);
          }}
          types={api}
        />
      </form>
    );
  }
  render(<Harness />);
  return { api, value: () => latest };
}
const draft = (url: string, over: Partial<LinkDraft> = {}): LinkDraft => ({
  ...emptyLinkDraft(),
  url,
  ...over,
});

it('starts closed and empty for a new service, and adds a row that takes focus', async () => {
  const { value } = setup();
  const trigger = screen.getByRole('button', { name: /Other addresses/ });
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(trigger);
  expect(screen.getByText(/No other addresses/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Add address' }));
  const url = (await screen.findByLabelText('Address 1 URL')) as HTMLInputElement;
  await waitFor(() => expect(document.activeElement).toBe(url));
  fireEvent.change(url, { target: { value: 'http://192.168.1.5:8080' } });
  expect(value()).toMatchObject([
    { url: 'http://192.168.1.5:8080', typeId: null, openTarget: null },
  ]);
  expect(screen.getByText('1 of 10')).toBeTruthy();
});

it('opens by itself and shows the count when the service already has addresses', () => {
  setup([draft('http://a.example'), draft('http://b.example')]);
  const trigger = screen.getByRole('button', { name: 'Other addresses (2)' });
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByLabelText('Address 2 URL')).toBeTruthy();
});

it('reorders with the arrows and removes a row', () => {
  const { value } = setup([
    draft('http://a.example'),
    draft('http://b.example'),
    draft('http://c.example'),
  ]);
  const first = screen.getByRole('button', { name: 'Move address 1 up' }) as HTMLButtonElement;
  expect(first.disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Move address 3 up' }));
  expect(value().map((item) => item.url)).toEqual([
    'http://a.example',
    'http://c.example',
    'http://b.example',
  ]);
  fireEvent.click(screen.getByRole('button', { name: 'Move address 1 down' }));
  expect(value().map((item) => item.url)).toEqual([
    'http://c.example',
    'http://a.example',
    'http://b.example',
  ]);
  fireEvent.click(screen.getByRole('button', { name: 'Remove address 2' }));
  expect(value().map((item) => item.url)).toEqual(['http://c.example', 'http://b.example']);
  expect(
    (screen.getByRole('button', { name: 'Move address 2 down' }) as HTMLButtonElement).disabled,
  ).toBe(true);
});

it('stops adding at ten addresses', () => {
  setup(Array.from({ length: 10 }, (_, index) => draft(`http://10.0.0.${index + 1}`)));
  expect((screen.getByRole('button', { name: 'Add address' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(screen.getByText('Limit of 10 reached.')).toBeTruthy();
});

it('requires a valid URL on every row', () => {
  setup([draft('')]);
  const url = screen.getByLabelText('Address 1 URL') as HTMLInputElement;
  expect(url.required).toBe(true);
  expect(url.type).toBe('url');
});

it('chooses an existing type and clears it', () => {
  const { value } = setup([draft('http://a.example')]);
  fireEvent.click(screen.getByRole('combobox', { name: 'Type of address 1' }));
  fireEvent.click(screen.getByRole('option', { name: /^LAN/ }));
  expect(value()[0].typeId).toBe(1);
  expect(
    within(screen.getByRole('combobox', { name: 'Type of address 1' })).getByText('LAN'),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('combobox', { name: 'Type of address 1' }));
  fireEvent.click(screen.getByRole('option', { name: 'No type' }));
  expect(value()[0].typeId).toBeNull();
});

it('creates a type from what was typed, selects it and lets the color be chosen', async () => {
  const { api, value } = setup([draft('http://a.example')]);
  fireEvent.click(screen.getByRole('combobox', { name: 'Type of address 1' }));
  fireEvent.change(screen.getByPlaceholderText('Search or create a type…'), {
    target: { value: 'Backup' },
  });
  fireEvent.click(await screen.findByRole('option', { name: /Create type “Backup”/ }));
  // The first color not used by an existing type (LAN uses green).
  await waitFor(() => expect(api.create).toHaveBeenCalledWith('Backup', 'neutral'));
  await waitFor(() => expect(value()[0].typeId).toBe(9));
  expect(await screen.findByText('New type')).toBeTruthy();
  fireEvent.click(screen.getByRole('radio', { name: 'Violet' }));
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  await waitFor(() =>
    expect(api.update).toHaveBeenCalledWith(9, { name: 'Backup', color: 'violet' }),
  );
});

it('offers suggestions that are not created yet and creates one when picked', async () => {
  const { api, value } = setup([draft('http://a.example')]);
  fireEvent.click(screen.getByRole('combobox', { name: 'Type of address 1' }));
  expect(screen.getByText('Suggestions')).toBeTruthy();
  // LAN already exists, so only the other three are suggested.
  expect(screen.queryByRole('option', { name: 'LAN', selected: false })).toBeTruthy();
  fireEvent.click(screen.getByRole('option', { name: 'Admin' }));
  await waitFor(() => expect(api.create).toHaveBeenCalledWith('Admin', 'ember'));
  await waitFor(() => expect(value()[0].typeId).toBe(9));
});

it('edits and deletes a type, warning about the addresses that use it', async () => {
  const { api, value } = setup([draft('http://a.example', { typeId: 1 })]);
  fireEvent.click(screen.getByRole('combobox', { name: 'Type of address 1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit type LAN' }));
  expect(screen.getByText('Edit type', { selector: 'h4' })).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Rede local' } });
  fireEvent.click(screen.getByRole('radio', { name: 'Teal' }));
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  await waitFor(() =>
    expect(api.update).toHaveBeenCalledWith(1, { name: 'Rede local', color: 'teal' }),
  );

  fireEvent.click(screen.getByRole('combobox', { name: 'Type of address 1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit type LAN' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(screen.getByText(/Used by 2 addresses/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Delete type' }));
  await waitFor(() => expect(api.remove).toHaveBeenCalledWith(1));
  await waitFor(() => expect(value()[0].typeId).toBeNull());
});

it('shows the server error and keeps the panel when a type cannot be saved', async () => {
  const { api } = setup([draft('http://a.example')]);
  api.create.mockResolvedValueOnce({ error: 'A type with this name already exists.' } as never);
  fireEvent.click(screen.getByRole('combobox', { name: 'Type of address 1' }));
  fireEvent.change(screen.getByPlaceholderText('Search or create a type…'), {
    target: { value: 'Backup' },
  });
  fireEvent.click(await screen.findByRole('option', { name: /Create type/ }));
  expect((await screen.findByRole('alert')).textContent).toContain('already exists');
});
