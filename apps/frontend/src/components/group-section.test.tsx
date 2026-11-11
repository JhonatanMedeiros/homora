// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GroupSection } from './group-section';

afterEach(cleanup);

const base = {
  category: 'Infra',
  count: 2,
  organizing: false,
  compact: false,
  searching: false,
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
    <GroupSection {...base} columns={4}>
      <li>a</li>
    </GroupSection>,
  );
  const list = container.querySelector('ul');
  expect(list?.className).toContain('lg:grid-cols-4');
  expect(list?.className).toContain('grid-cols-1');
  expect(list?.className).not.toContain('xl:grid-cols-3');
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

it('only presents column selection in organize mode and reports selection', () => {
  const onColumns = vi.fn();
  const { rerender } = render(
    <GroupSection {...base} columns={3} onColumns={onColumns}>
      <li>a</li>
    </GroupSection>,
  );
  expect(screen.queryByLabelText('Colunas do grupo Infra')).toBeNull();
  rerender(
    <GroupSection {...base} organizing columns={3} onColumns={onColumns}>
      <li>a</li>
    </GroupSection>,
  );
  const select = screen.getByLabelText('Colunas do grupo Infra') as HTMLSelectElement;
  expect(select.value).toBe('3');
  fireEvent.change(select, { target: { value: '5' } });
  expect(onColumns).toHaveBeenLastCalledWith(5);
  fireEvent.change(select, { target: { value: '' } });
  expect(onColumns).toHaveBeenLastCalledWith(null);
  expect([...select.options].map((option) => option.textContent)).toEqual([
    'Colunas automáticas',
    '1 coluna',
    '2 colunas',
    '3 colunas',
    '4 colunas',
    '5 colunas',
    '6 colunas',
  ]);
});
