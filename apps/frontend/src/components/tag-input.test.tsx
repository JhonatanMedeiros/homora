// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TagInput } from './tag-input';
import { setLocale } from '@/i18n';

afterEach(cleanup);

it('adds a normalised tag on Enter, ignores duplicates and removes with the button', () => {
  setLocale('en');
  const onChange = vi.fn();
  render(<TagInput id="t" value={['prod']} onChange={onChange} />);
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: ' Media Server ' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onChange).toHaveBeenLastCalledWith(['prod', 'media-server']);
  fireEvent.change(input, { target: { value: 'prod' } });
  fireEvent.keyDown(input, { key: ',' });
  expect(onChange).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Remove tag prod' }));
  expect(onChange).toHaveBeenLastCalledWith([]);
});
