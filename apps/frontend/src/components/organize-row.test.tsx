// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { OrganizeRow } from './organize-row';

afterEach(cleanup);

const noop = () => {};
function setup(overrides: Partial<Parameters<typeof OrganizeRow>[0]> = {}) {
  const props = {
    service: { id: 1, name: 'Wiki', url: 'https://wiki.test', category: 'Casa', description: '' },
    otherGroups: ['Infra', 'Mídia'],
    first: false,
    last: false,
    dragging: false,
    dropTarget: false,
    onMove: vi.fn(),
    onMoveToTop: vi.fn(),
    onMoveToGroup: vi.fn(),
    dragProps: { onDragStart: noop, onDragEnd: noop, onDragOver: noop, onDrop: noop },
    ...overrides,
  };
  render(
    <ul>
      <OrganizeRow {...props} />
    </ul>,
  );
  return props;
}

it('moves with the arrows and disables them at the ends', () => {
  const props = setup();
  fireEvent.click(screen.getByLabelText('Mover Wiki para cima'));
  expect(props.onMove).toHaveBeenLastCalledWith(-1);
  fireEvent.click(screen.getByLabelText('Mover Wiki para baixo'));
  expect(props.onMove).toHaveBeenLastCalledWith(1);
  cleanup();
  setup({ first: true, last: true });
  expect(screen.getByLabelText('Mover Wiki para cima').getAttribute('aria-disabled')).toBe('true');
  expect(screen.getByLabelText('Mover Wiki para baixo').getAttribute('aria-disabled')).toBe('true');
});

it('moves to the top and to another group from the menu', async () => {
  const props = setup();
  fireEvent.keyDown(screen.getByLabelText('Opções de Wiki'), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Mover para o topo' }));
  expect(props.onMoveToTop).toHaveBeenCalled();
  fireEvent.keyDown(screen.getByLabelText('Opções de Wiki'), { key: 'Enter' });
  const trigger = await screen.findByRole('menuitem', { name: 'Mover para o grupo' });
  fireEvent.keyDown(trigger, { key: 'ArrowRight' });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Infra' }));
  expect(props.onMoveToGroup).toHaveBeenCalledWith('Infra');
});

it('hides the group move when there is no other group', async () => {
  setup({ otherGroups: [] });
  fireEvent.keyDown(screen.getByLabelText('Opções de Wiki'), { key: 'Enter' });
  await screen.findByRole('menuitem', { name: 'Mover para o topo' });
  expect(screen.queryByRole('menuitem', { name: 'Mover para o grupo' })).toBeNull();
});
