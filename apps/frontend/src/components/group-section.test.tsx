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

it('uses auto grid without selected columns and custom count when specified', () => {
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
  expect(list?.className).not.toContain('lg:grid-cols-3');
  expect(list?.className).not.toContain('xl:grid-cols-3');
  rerender(
    <GroupSection {...base} columns={5}>
      <li>a</li>
    </GroupSection>,
  );
  // Saved values above 3 are applied as 3.
  expect(container.querySelector('ul')?.className).toContain('lg:grid-cols-3');
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
  expect(container.querySelector('ul')?.className).toContain('lg:grid-cols-3');
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

it('lists one row per line in management and always uses rows in organize mode', () => {
  const { container, rerender } = render(
    <GroupSection {...base} list managing>
      <li>a</li>
    </GroupSection>,
  );
  expect(container.querySelector('ul')?.className).toBe('grid grid-cols-1 gap-1.5');
  rerender(
    <GroupSection {...base} organizing managing columns={3}>
      <li>a</li>
    </GroupSection>,
  );
  expect(container.querySelector('ul')?.className).toBe('grid grid-cols-1 gap-1.5');
});
