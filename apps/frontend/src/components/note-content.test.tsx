// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NoteContent } from './note-content';

afterEach(cleanup);
it('renders basic Markdown but never executes HTML or unsafe links', () => {
  const { container } = render(
    <NoteContent
      text={
        '**Bold** and *italic*\n\n- one\n- two\n\n[good](https://example.com) [bad](javascript:alert(1))\n\n<img src=x onerror=alert(1)>'
      }
    />,
  );
  expect(container.querySelector('strong')?.textContent).toBe('Bold');
  expect(container.querySelector('em')?.textContent).toBe('italic');
  expect(container.querySelectorAll('li')).toHaveLength(2);
  expect(screen.getByRole('link', { name: 'good' }).getAttribute('href')).toBe(
    'https://example.com',
  );
  expect(screen.queryByRole('link', { name: 'bad' })).toBeNull();
  expect(container.querySelector('img')).toBeNull();
});
