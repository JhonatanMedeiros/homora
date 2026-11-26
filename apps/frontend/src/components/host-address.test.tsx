// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { HostAddress } from '@/components/host-address';

afterEach(cleanup);

it('keeps the port apart so truncation never hides it', () => {
  render(<HostAddress url="http://192.168.100.100:18096/web" />);
  const address = screen.getByTitle('192.168.100.100:18096');
  expect(address.lastElementChild?.textContent).toBe(':18096');
  expect(address.textContent).toBe('192.168.100.100:18096');
});
