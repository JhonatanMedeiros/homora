// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { FileField } from './file-field';

afterEach(cleanup);

test('shows a picker while empty and forwards the chosen file', () => {
  const onSelect = vi.fn();
  const { container } = render(
    <FileField id="f" accept=".pem" value={null} onSelect={onSelect} onClear={vi.fn()} />,
  );
  const file = new File(['x'], 'ca.pem');
  fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [file] } });
  expect(onSelect).toHaveBeenCalledWith(file);
});

test('shows the chosen file with a remove action', () => {
  const onClear = vi.fn();
  render(
    <FileField
      id="f"
      accept=".pem"
      value={{ name: 'ca.pem', size: 2048 }}
      onSelect={vi.fn()}
      onClear={onClear}
    />,
  );
  expect(screen.getByText('ca.pem')).toBeTruthy();
  expect(screen.getByText('2.0 KB')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /ca\.pem/ }));
  expect(onClear).toHaveBeenCalled();
});
