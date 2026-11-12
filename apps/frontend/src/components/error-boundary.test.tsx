// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './error-boundary';
import { setLocale } from '@/i18n';

function Broken(): never {
  throw new Error('private detail');
}

afterEach(() => {
  vi.restoreAllMocks();
  setLocale('en');
});

it('shows a localized recovery screen without exposing the exception', () => {
  setLocale('pt-BR');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  render(
    <ErrorBoundary>
      <Broken />
    </ErrorBoundary>,
  );
  expect(screen.getByRole('heading', { name: 'Algo deu errado' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Recarregar página' })).toBeTruthy();
  expect(screen.queryByText('private detail')).toBeNull();
});
