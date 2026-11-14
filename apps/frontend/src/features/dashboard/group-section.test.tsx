// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GroupSection } from './group-section';

afterEach(cleanup);

const base = {
  category: 'Infra',
  count: 2,
  organizing: false,
  canEdit: true,
  canRemove: false,
  groupId: 1,
  onRename: () => {},
  onRemove: () => {},
  onMove: () => {},
};

it('uses card grid without a selected count and respects saved counts', () => {
  const { container, rerender } = render(
    <GroupSection {...base}>
      <li>a</li>
    </GroupSection>,
  );
  expect(container.querySelector('ul')?.className).toContain('xl:grid-cols-3');
  rerender(
    <GroupSection {...base} columns={2}>
      <li>a</li>
    </GroupSection>,
  );
  const list = container.querySelector('ul');
  expect(list?.className).toContain('sm:grid-cols-2');
  expect(list?.className).not.toContain('xl:grid-cols-3');
  rerender(
    <GroupSection {...base} columns={5}>
      <li>a</li>
    </GroupSection>,
  );
  // Saved values above 3 are applied as 3.
  expect(container.querySelector('ul')?.className).toContain('xl:grid-cols-3');
  rerender(
    <GroupSection {...base} columns={1}>
      <li>a</li>
    </GroupSection>,
  );
  expect(container.querySelector('ul')?.className).not.toContain('sm:grid-cols-2');
  rerender(
    <GroupSection {...base} columns={99}>
      <li>a</li>
    </GroupSection>,
  );
  expect(container.querySelector('ul')?.className).toContain('xl:grid-cols-3');
});

it('puts columns, rename, and remove in the group menu in organize mode only', async () => {
  const onColumns = vi.fn();
  const onRename = vi.fn();
  const onRemove = vi.fn();
  const { rerender } = render(
    <GroupSection {...base} columns={3} onColumns={onColumns}>
      <li>a</li>
    </GroupSection>,
  );
  expect(screen.queryByLabelText('Opções do grupo Infra')).toBeNull();
  rerender(
    <GroupSection
      {...base}
      organizing
      canRemove
      columns={5}
      onColumns={onColumns}
      onRename={onRename}
      onRemove={onRemove}
    >
      <li>a</li>
    </GroupSection>,
  );
  const open = () =>
    fireEvent.keyDown(screen.getByLabelText('Opções do grupo Infra'), { key: 'Enter' });
  open();
  // A saved value of 5 is shown as 3, the largest option.
  const three = await screen.findByRole('menuitemradio', { name: '3 colunas' });
  expect(three.getAttribute('aria-checked')).toBe('true');
  expect(screen.queryByRole('menuitemradio', { name: '4 colunas' })).toBeNull();
  fireEvent.click(screen.getByRole('menuitemradio', { name: '2 colunas' }));
  expect(onColumns).toHaveBeenLastCalledWith(2);
});

it('renames and removes from the group menu', async () => {
  const onRename = vi.fn();
  const onRemove = vi.fn();
  render(
    <GroupSection {...base} organizing canRemove onRename={onRename} onRemove={onRemove}>
      <li>a</li>
    </GroupSection>,
  );
  fireEvent.keyDown(screen.getByLabelText('Opções do grupo Infra'), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Renomear' }));
  expect(onRename).toHaveBeenCalled();
  fireEvent.keyDown(screen.getByLabelText('Opções do grupo Infra'), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Remover' }));
  expect(onRemove).toHaveBeenCalled();
});

it('packs rows in two columns on wide screens, and keeps rows in organize mode', () => {
  const { container, rerender } = render(
    <GroupSection {...base} list>
      <li>a</li>
    </GroupSection>,
  );
  expect(container.querySelector('ul')?.className).toBe('grid grid-cols-1 gap-1.5 lg:grid-cols-2');
  rerender(
    <GroupSection {...base} organizing>
      <li>a</li>
    </GroupSection>,
  );
  expect(container.querySelector('ul')?.className).toBe('grid grid-cols-1 gap-1.5 lg:grid-cols-2');
});

it('auto-collapses a healthy group without saving it, and lets the person open it', () => {
  localStorage.clear();
  const { container } = render(
    <GroupSection {...base} autoCollapse>
      <li>a</li>
    </GroupSection>,
  );
  expect(container.querySelector('ul')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Expandir grupo Infra|Expand group Infra/ }));
  expect(container.querySelector('ul')).toBeTruthy();
  // Nothing was written: a reload goes back to the automatic behavior.
  expect(localStorage.getItem('homora-collapsed-groups')).toBeNull();
});

it('packs compact tiles tighter than cards', () => {
  const { container } = render(
    <GroupSection {...base} compact>
      <li>a</li>
    </GroupSection>,
  );
  expect(container.querySelector('ul')?.className).toContain('gap-2');
});
