// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { StoredSummaryLayout, SummaryBlock } from '@homora/shared';
import { SUMMARY_BLOCKS } from '@homora/shared';
import { setLocale } from '@/i18n';
import { SummaryBoard } from './summary-board';
import type { BlockView } from './summary-blocks';

const blocks = Object.fromEntries(
  SUMMARY_BLOCKS.map((block) => [
    block,
    { title: block, node: <p>content of {block}</p>, absent: block === 'proposals' },
  ]),
) as unknown as Record<SummaryBlock, BlockView>;

const widget = {
  id: 7,
  pageId: 1,
  type: 'clock',
  name: 'Kitchen',
  config: { timeZone: '', format: '24h', showDate: true, showSeconds: false },
  connectionId: null,
  position: 0,
  version: 1,
  size: 'normal',
};

type Options = {
  layouts?: StoredSummaryLayout[];
  /** Status of each save, in order; 200 when exhausted. */
  saves?: number[];
  failLayouts?: boolean;
  failWidgets?: boolean;
};

function stubApi({ layouts = [], saves = [], failLayouts, failWidgets }: Options = {}) {
  let rows = layouts;
  const sent: { revision: number; desktop: unknown; phone: unknown }[] = [];
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/summary-layouts')
      return failLayouts ? new Response('{}', { status: 500 }) : new Response(JSON.stringify(rows));
    if (url === '/api/pages/1/summary-layout') {
      const body = JSON.parse(String(init?.body));
      sent.push(body);
      const status = saves.shift() ?? 200;
      if (status !== 200) {
        // Someone else saved in the meantime.
        rows = [{ pageId: 1, revision: 9, desktop: null, phone: null }];
        return new Response(JSON.stringify({ code: 'summary-layout-conflict' }), { status });
      }
      const row = { pageId: 1, ...body, revision: body.revision + 1 };
      rows = [row];
      return new Response(JSON.stringify(row));
    }
    if (url === '/api/page-widgets')
      return failWidgets
        ? new Response('{}', { status: 500 })
        : new Response(JSON.stringify([widget]));
    return new Response('[]');
  });
  vi.stubGlobal('fetch', fetcher);
  return sent;
}

function show(phone = false) {
  render(
    <SummaryBoard
      pageId={1}
      pages={[{ id: 1, name: 'Home', position: 0, groups: 0 }]}
      groups={[]}
      phone={phone}
      blocks={blocks}
      openMonitor={() => {}}
    />,
  );
}

const order = () =>
  [...document.querySelectorAll<HTMLElement>('[data-block]')].map((cell) => cell.dataset.block);
const customize = async () => {
  const button = await screen.findByRole('button', { name: 'Customize' });
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(button);
};
const openMenu = (name: string) => {
  const trigger = screen.getByRole('button', { name: `Arrange ${name}` });
  fireEvent.keyDown(trigger, { key: 'Enter' });
};
const choose = async (name: string) =>
  fireEvent.click(await screen.findByRole('menuitem', { name }));

beforeEach(() => setLocale('en'));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('opens with every block that has something to show, and the page widgets', async () => {
  stubApi();
  show();
  await screen.findByText('Kitchen');
  expect(order()).toContain('widget:7');
  expect(order()).not.toContain('proposals');
  expect(order()).toHaveLength(SUMMARY_BLOCKS.length);
});

it('shows blocks without content while arranging, and keeps their input off', async () => {
  stubApi();
  show();
  await customize();
  expect(order()).toContain('proposals');
  expect(screen.getByText('content of pinned').closest('[inert]')).toBeTruthy();
});

it('saves moves and removed blocks only on Done', async () => {
  const sent = stubApi();
  show();
  await customize();
  openMenu('attention');
  await choose('Move earlier');
  openMenu('hosts');
  await choose('Remove');
  expect(sent).toHaveLength(0);
  expect(order().slice(0, 2)).toEqual(['attention', 'pinned']);
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  await screen.findByRole('button', { name: 'Customize' });
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ revision: 0, phone: null });
  expect(sent[0]!.desktop).toContainEqual(
    expect.objectContaining({ block: 'hosts', hidden: true }),
  );
  expect(order()).not.toContain('hosts');
});

it('brings a removed block back from Add widget, and discards it on Cancel', async () => {
  const sent = stubApi({
    layouts: [
      {
        pageId: 1,
        revision: 3,
        desktop: [{ block: 'latency', width: 12, height: 2, hidden: true }],
        phone: null,
      },
    ],
  });
  show();
  await customize();
  fireEvent.click(screen.getByRole('button', { name: 'Add widget' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: /^latency/ }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(order().at(-1)).toBe('latency');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(order()).not.toContain('latency');
  expect(sent).toHaveLength(0);
});

it('stores no arrangement after Restore default', async () => {
  const sent = stubApi({
    layouts: [
      {
        pageId: 1,
        revision: 2,
        desktop: [{ block: 'latency', width: 12, height: 2, hidden: false }],
        phone: [{ block: 'status', hidden: false }],
      },
    ],
  });
  show();
  await customize();
  fireEvent.click(screen.getByRole('button', { name: 'Restore default' }));
  expect(order()[0]).toBe('pinned');
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  await screen.findByRole('button', { name: 'Customize' });
  expect(sent[0]).toEqual({
    revision: 2,
    desktop: null,
    phone: [{ block: 'status', hidden: false }],
  });
});

it('keeps the work when someone else saved, and replaces it on a second Done', async () => {
  const sent = stubApi({ saves: [409] });
  show();
  await customize();
  openMenu('attention');
  await choose('Move earlier');
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/changed somewhere else/);
  expect(order()[0]).toBe('attention');
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  await screen.findByRole('button', { name: 'Customize' });
  expect(sent.map((body) => body.revision)).toEqual([0, 9]);
});

it('reorders and removes on phones without touching the wide arrangement', async () => {
  const sent = stubApi();
  show(true);
  await customize();
  fireEvent.click(screen.getByRole('button', { name: 'Move attention up' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove status' }));
  expect(screen.queryByRole('button', { name: /^Arrange/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  await screen.findByRole('button', { name: 'Customize' });
  expect(sent[0]!.desktop).toBeNull();
  expect(order()[0]).toBe('attention');
  expect(order()).not.toContain('status');
});

it('deletes a widget only after confirming', async () => {
  const sent = stubApi();
  show();
  await customize();
  openMenu('Kitchen');
  await choose('Remove');
  const dialog = await screen.findByRole('alertdialog');
  expect(dialog.textContent).toMatch(/Summary and Services/);
  const deleted = () => vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === 'DELETE');
  expect(deleted()).toBe(false);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
  await waitFor(() => expect(deleted()).toBe(true));
  expect(sent).toHaveLength(0);
});

it('keeps showing a widget stored as taken off the Summary', async () => {
  stubApi({
    layouts: [
      {
        pageId: 1,
        revision: 1,
        desktop: [{ widgetId: 7, width: 4, height: 2, hidden: true }],
        phone: null,
      },
    ],
  });
  show();
  await screen.findByText('Kitchen');
  expect(order()[0]).toBe('widget:7');
});

it('shows the default and blocks editing when the arrangement cannot be read', async () => {
  stubApi({ failLayouts: true });
  show();
  expect((await screen.findByRole('alert')).textContent).toMatch(/default one is shown/);
  expect(order()[0]).toBe('pinned');
  expect((screen.getByRole('button', { name: 'Customize' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
});

it('blocks editing when the widgets cannot be read, so their places are not lost', async () => {
  stubApi({ failWidgets: true });
  show();
  expect(await screen.findByText('Could not load page widgets.')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Customize' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
});

it('saves after a widget is gone, dropping its place on both kinds of screen', async () => {
  const gone = { widgetId: 99, width: 4, height: 2, hidden: false };
  const sent = stubApi({
    layouts: [
      { pageId: 1, revision: 1, desktop: [gone], phone: [{ widgetId: 99, hidden: false }] },
    ],
  });
  show();
  await customize();
  openMenu('attention');
  await choose('Move earlier');
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  await screen.findByRole('button', { name: 'Customize' });
  expect(sent[0]!.phone).toEqual([]);
  expect(JSON.stringify(sent[0]!.desktop)).not.toContain('99');
});
