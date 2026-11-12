// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { useShortcuts } from './use-shortcuts';

const handlers = () => ({
  enabled: true,
  canCreateService: true,
  onTogglePalette: vi.fn(),
  onOpenPalette: vi.fn(),
  onOpenHelp: vi.fn(),
  onGo: vi.fn(),
  onNewService: vi.fn(),
});
function Host(props: ReturnType<typeof handlers>) {
  useShortcuts(props);
  return (
    <div>
      <input aria-label="field" />
      <textarea aria-label="area" />
      <div contentEditable suppressContentEditableWarning aria-label="editable" />
    </div>
  );
}
let h: ReturnType<typeof handlers>;
const setup = (extra: Partial<ReturnType<typeof handlers>> = {}) => {
  h = { ...handlers(), ...extra };
  return render(<Host {...h} />);
};
const press = (key: string, init: KeyboardEventInit = {}, target: Element = document.body) =>
  fireEvent.keyDown(target, { key, ...init });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('opens the palette with / and the help with ?', () => {
  setup();
  press('/');
  press('?', { shiftKey: true });
  expect(h.onOpenPalette).toHaveBeenCalledOnce();
  expect(h.onOpenHelp).toHaveBeenCalledOnce();
});

it('goes to a section with g then a letter', () => {
  setup();
  for (const [key, tab] of [
    ['h', 'services'],
    ['i', 'integrations'],
    ['a', 'agents'],
    ['t', 'activity'],
    ['s', 'settings'],
  ] as const) {
    press('g');
    press(key);
    expect(h.onGo).toHaveBeenLastCalledWith(tab);
  }
  expect(h.onGo).toHaveBeenCalledTimes(5);
});

it('expires a chord after about a second and cancels it on any other key', () => {
  setup();
  press('g');
  act(() => void vi.advanceTimersByTime(1100));
  press('i');
  expect(h.onGo).not.toHaveBeenCalled();
  press('g');
  press('x');
  press('i');
  expect(h.onGo).not.toHaveBeenCalled();
  press('g');
  press('Shift');
  press('i');
  expect(h.onGo).toHaveBeenCalledWith('integrations');
});

it('does not let a lone letter act without the g prefix', () => {
  setup();
  press('i');
  press('h');
  expect(h.onGo).not.toHaveBeenCalled();
});

it('creates a service with n only where that makes sense', () => {
  setup();
  press('n');
  expect(h.onNewService).toHaveBeenCalledOnce();
  cleanup();
  setup({ canCreateService: false });
  press('n');
  expect(h.onNewService).not.toHaveBeenCalled();
});

it('stays quiet while typing', () => {
  const { getByLabelText } = setup();
  for (const label of ['field', 'area', 'editable']) {
    const element = getByLabelText(label);
    press('/', {}, element);
    press('n', {}, element);
  }
  expect(h.onOpenPalette).not.toHaveBeenCalled();
  expect(h.onNewService).not.toHaveBeenCalled();
});

it('stays quiet inside dialogs, menus and modals, wherever the focus is', () => {
  setup();
  for (const attributes of [{ role: 'dialog' }, { role: 'menu' }, { 'aria-modal': 'true' }]) {
    const overlay = document.createElement('div');
    for (const [name, value] of Object.entries(attributes)) overlay.setAttribute(name, value);
    document.body.append(overlay);
    press('/');
    press('/', {}, overlay);
    overlay.remove();
  }
  expect(h.onOpenPalette).not.toHaveBeenCalled();
});

it('ignores modifiers, composition, repeats and handled events', () => {
  setup();
  press('/', { ctrlKey: true });
  press('/', { metaKey: true });
  press('/', { altKey: true });
  press('/', { isComposing: true });
  press('/', { repeat: true });
  const event = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
  event.preventDefault();
  document.body.dispatchEvent(event);
  expect(h.onOpenPalette).not.toHaveBeenCalled();
});

it('turns the single keys off but keeps Ctrl/Cmd+K, even in a field', () => {
  const { getByLabelText } = setup({ enabled: false });
  press('/');
  press('?');
  press('n');
  press('g');
  press('h');
  expect(h.onOpenPalette).not.toHaveBeenCalled();
  expect(h.onOpenHelp).not.toHaveBeenCalled();
  expect(h.onNewService).not.toHaveBeenCalled();
  expect(h.onGo).not.toHaveBeenCalled();
  press('k', { ctrlKey: true }, getByLabelText('field'));
  press('K', { metaKey: true });
  expect(h.onTogglePalette).toHaveBeenCalledTimes(2);
});

it('removes its listener on unmount', () => {
  const { unmount } = setup();
  unmount();
  press('/');
  expect(h.onOpenPalette).not.toHaveBeenCalled();
});

it('switches pages with the digit keys and only claims the key when a page took it', () => {
  const onGoPage = vi.fn((index: number) => index === 1);
  setup({ onGoPage } as never);
  expect(press('2')).toBe(false);
  expect(onGoPage).toHaveBeenCalledWith(1);
  expect(press('3')).toBe(true);
  expect(onGoPage).toHaveBeenLastCalledWith(2);
});

it('ignores the digit keys while typing in a field', () => {
  const onGoPage = vi.fn(() => true);
  setup({ onGoPage } as never);
  press('1', {}, document.querySelector('input') as Element);
  expect(onGoPage).not.toHaveBeenCalled();
});
