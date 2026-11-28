// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { StoredSummaryLayout, SummaryChange } from '@homora/shared';
import { summaryWidgetTypes } from '@homora/widgets/summary';
import { setLocale } from '@/i18n';
import { SummaryBoard } from './summary-board';
import type { SummaryContent } from './summary-content';

const name = (type: string) => type.replace('summary-', '');
const content: SummaryContent = ({ type }) => ({
  title: name(type),
  node: <p>content of {name(type)}</p>,
  absent: type === 'summary-proposals',
});

const row = (id: number, type: string, extra: object = {}) => ({
  id,
  pageId: 1,
  type,
  name: '',
  config: {},
  connectionId: null,
  position: id,
  version: 1,
  size: 'normal',
  ...extra,
});
const idOf = (short: string) => summaryWidgetTypes.indexOf(`summary-${short}` as never) + 1;
const clock = row(50, 'clock', {
  name: 'Kitchen',
  config: { timeZone: '', format: '24h', showDate: true, showSeconds: false },
});
const everything = [...summaryWidgetTypes.map((type, index) => row(index + 1, type)), clock];

type Options = {
  layouts?: StoredSummaryLayout[];
  /** Status of each save, in order; 200 when exhausted. */
  saves?: number[];
  failLayouts?: boolean;
  failWidgets?: boolean;
};

function stubApi({ layouts = [], saves = [], failLayouts, failWidgets }: Options = {}) {
  let rows = layouts;
  let widgets = everything;
  const sent: SummaryChange[] = [];
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/summary-layouts')
      return failLayouts ? new Response('{}', { status: 500 }) : new Response(JSON.stringify(rows));
    if (url === '/api/pages/1/summary-layout') {
      const body = JSON.parse(String(init?.body)) as SummaryChange;
      sent.push(body);
      const status = saves.shift() ?? 200;
      if (status !== 200) {
        // Someone else saved in the meantime.
        rows = [{ pageId: 1, revision: 9, desktop: null, phone: null }];
        return new Response(JSON.stringify({ code: 'summary-layout-conflict' }), { status });
      }
      widgets = widgets.filter((widget) => !body.remove?.includes(widget.id));
      const saved = {
        pageId: 1,
        desktop: body.desktop,
        phone: body.phone,
        revision: body.revision + 1,
      };
      rows = [saved];
      return new Response(JSON.stringify(saved));
    }
    if (url === '/api/page-widgets')
      return failWidgets
        ? new Response('{}', { status: 500 })
        : new Response(JSON.stringify(widgets));
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
      content={content}
      openMonitor={() => {}}
    />,
  );
}

const order = () =>
  [...document.querySelectorAll<HTMLElement>('[data-widget-type]')].map((cell) =>
    name(cell.dataset.widgetType!),
  );
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

const done = () => fireEvent.click(screen.getByRole('button', { name: 'Done' }));
const saved = () => screen.findByRole('button', { name: 'Customize' });
const addFromGallery = async (option: RegExp) => {
  fireEvent.click(screen.getByRole('button', { name: 'Add widget' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getAllByRole('button', { name: option })[0]!);
  return dialog;
};

it('opens with every widget that has something to show', async () => {
  stubApi();
  show();
  await screen.findByText('Kitchen');
  expect(order()).toContain('clock');
  expect(order()).not.toContain('proposals');
  expect(order()).toHaveLength(everything.length - 1);
});

it('shows widgets without content while arranging, and keeps their input off', async () => {
  stubApi();
  show();
  await customize();
  expect(order()).toContain('proposals');
  expect(screen.getByText('content of pinned').closest('[inert]')).toBeTruthy();
});

it('saves moves and removals only on Done', async () => {
  const sent = stubApi();
  show();
  await customize();
  openMenu('attention');
  await choose('Move earlier');
  openMenu('hosts');
  await choose('Remove');
  expect(sent).toHaveLength(0);
  expect(order().slice(0, 2)).toEqual(['attention', 'pinned']);
  expect(order()).not.toContain('hosts');
  expect(screen.getByText(/deleted when you press Done/)).toBeTruthy();
  done();
  await saved();
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ revision: 0, phone: null, add: [], remove: [idOf('hosts')] });
  expect(sent[0]!.desktop).not.toContainEqual(expect.objectContaining({ widgetId: idOf('hosts') }));
  expect(order()).not.toContain('hosts');
});

it('adds a removed widget back from the gallery, and discards it on Cancel', async () => {
  const sent = stubApi();
  show();
  await customize();
  openMenu('latency');
  await choose('Remove');
  await addFromGallery(/Latency now/);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(order()).toContain('latency');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(order()).toContain('latency');
  expect(sent).toHaveLength(0);
});

it('creates the added widgets together with the arrangement', async () => {
  const sent = stubApi();
  show();
  await customize();
  await addFromGallery(/Services by state/);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(order().filter((item) => item === 'status')).toHaveLength(2);
  done();
  await saved();
  expect(sent[0]!.add).toEqual([
    { id: -1, type: 'summary-status', name: '', config: {}, connectionId: null, size: 'normal' },
  ]);
  expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
});

it('restores the default arrangement and the widgets it starts with', async () => {
  const sent = stubApi({
    layouts: [
      {
        pageId: 1,
        revision: 2,
        desktop: [{ widgetId: idOf('latency'), width: 12, height: 2 }],
        phone: [{ widgetId: idOf('status') }],
      },
    ],
  });
  show();
  await customize();
  openMenu('pinned');
  await choose('Remove');
  openMenu('Kitchen');
  await choose('Remove');
  fireEvent.click(screen.getByRole('button', { name: 'Restore default' }));
  expect(order()[0]).toBe('pinned');
  expect(order()).not.toContain('clock');
  done();
  fireEvent.click(await screen.findByRole('button', { name: 'Delete and save' }));
  await saved();
  expect(sent[0]).toEqual({
    revision: 2,
    desktop: null,
    phone: [{ widgetId: idOf('status') }],
    add: [],
    remove: [clock.id],
  });
});

it('asks before saving deletes a widget someone set up', async () => {
  const sent = stubApi();
  show();
  await customize();
  openMenu('Kitchen');
  await choose('Remove');
  done();
  const dialog = await screen.findByRole('alertdialog');
  expect(dialog.textContent).toMatch(/Kitchen/);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(sent).toHaveLength(0);
  done();
  fireEvent.click(await screen.findByRole('button', { name: 'Delete and save' }));
  await saved();
  expect(sent[0]!.remove).toEqual([clock.id]);
});

it('keeps the work when someone else saved, and replaces it on a second Done', async () => {
  const sent = stubApi({ saves: [409] });
  show();
  await customize();
  openMenu('attention');
  await choose('Move earlier');
  done();
  expect((await screen.findByRole('alert')).textContent).toMatch(/changed somewhere else/);
  expect(order()[0]).toBe('attention');
  done();
  await saved();
  expect(sent.map((body) => body.revision)).toEqual([0, 9]);
});

it('reorders and removes on phones without touching the wide arrangement', async () => {
  const sent = stubApi();
  show(true);
  await customize();
  fireEvent.click(screen.getByRole('button', { name: 'Move attention up' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove status' }));
  expect(screen.queryByRole('button', { name: /^Arrange/ })).toBeNull();
  done();
  await saved();
  expect(sent[0]!.desktop).toBeNull();
  expect(sent[0]!.remove).toEqual([idOf('status')]);
  expect(order()[0]).toBe('attention');
  expect(order()).not.toContain('status');
});

it('shows the default and blocks editing when the arrangement cannot be read', async () => {
  stubApi({ failLayouts: true });
  show();
  expect((await screen.findByRole('alert')).textContent).toMatch(/default one is shown/);
  await screen.findByText('Kitchen');
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
  const sent = stubApi({
    layouts: [
      {
        pageId: 1,
        revision: 1,
        desktop: [{ widgetId: 99, width: 4, height: 2 }],
        phone: [{ widgetId: 99 }],
      },
    ],
  });
  show();
  await customize();
  openMenu('attention');
  await choose('Move earlier');
  done();
  await saved();
  expect(sent[0]!.phone).toEqual([]);
  expect(JSON.stringify(sent[0]!.desktop)).not.toContain('99');
});

it('opens the options of a Summary widget only where there is something to choose', async () => {
  stubApi();
  show();
  await customize();
  openMenu('figures');
  await screen.findByRole('menuitem', { name: 'Remove' });
  expect(screen.queryByRole('menuitem', { name: 'Edit' })).toBeNull();
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
  openMenu('latency');
  await choose('Edit');
  expect(await screen.findByText('Shows everything.')).toBeTruthy();
});

it('opens the options on a phone too', async () => {
  stubApi();
  show(true);
  await customize();
  expect(screen.queryByRole('button', { name: 'Edit figures' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Edit latency' }));
  expect(await screen.findByText('Shows everything.')).toBeTruthy();
});
