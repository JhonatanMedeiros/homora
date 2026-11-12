// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { RowListSkeleton, ServicesSkeleton } from './skeletons';

afterEach(cleanup);

it('announces one busy status and hides the placeholder shapes', () => {
  render(<RowListSkeleton label="Loading connections" rows={2} />);
  const region = screen.getByRole('status');
  expect(region.getAttribute('aria-busy')).toBe('true');
  expect(region.textContent).toBe('Loading connections');
  expect(region.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  expect(region.querySelector('[aria-hidden="true"] [data-slot="skeleton"]')).not.toBeNull();
});

it('renders card or list placeholders for the services view', () => {
  const { container, rerender } = render(<ServicesSkeleton label="Loading" />);
  expect(container.querySelectorAll('.lg\\:grid-cols-3').length).toBe(2);
  rerender(<ServicesSkeleton label="Loading" list />);
  expect(container.querySelectorAll('.lg\\:grid-cols-3').length).toBe(0);
});
