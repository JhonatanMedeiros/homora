// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ApproveButton, HOLD_MS } from './approve-button';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const risky = (onApprove: () => void, shortcut?: string) =>
  render(
    <ApproveButton confirm description="Remove it" shortcut={shortcut} onApprove={onApprove}>
      Hold to approve
    </ApproveButton>,
  );

it('approves a risky change only after the button is held', () => {
  const onApprove = vi.fn();
  risky(onApprove);
  const button = screen.getByRole('button', { name: 'Hold to approve' });
  fireEvent.pointerDown(button);
  vi.advanceTimersByTime(HOLD_MS - 100);
  fireEvent.pointerUp(button);
  vi.advanceTimersByTime(HOLD_MS);
  expect(onApprove).not.toHaveBeenCalled();
  fireEvent.pointerDown(button);
  vi.advanceTimersByTime(HOLD_MS);
  expect(onApprove).toHaveBeenCalledTimes(1);
});

it('lets the keyboard hold Enter the same way', () => {
  const onApprove = vi.fn();
  risky(onApprove);
  const button = screen.getByRole('button', { name: 'Hold to approve' });
  fireEvent.keyDown(button, { key: 'Enter' });
  vi.advanceTimersByTime(HOLD_MS);
  expect(onApprove).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(button, { key: 'Enter' });
  fireEvent.keyUp(button, { key: 'Enter' });
  vi.advanceTimersByTime(HOLD_MS);
  expect(onApprove).toHaveBeenCalledTimes(1);
});

it('asks in a dialog when it is activated without a hold', () => {
  const onApprove = vi.fn();
  risky(onApprove);
  fireEvent.click(screen.getByRole('button', { name: 'Hold to approve' }));
  expect(screen.getByRole('alertdialog')).toBeTruthy();
  expect(onApprove).not.toHaveBeenCalled();
});

it('applies a routine change at once, also from its shortcut', () => {
  const onApprove = vi.fn();
  render(
    <ApproveButton confirm={false} description="" shortcut="a" onApprove={onApprove}>
      Approve
    </ApproveButton>,
  );
  fireEvent.keyDown(window, { key: 'a' });
  expect(onApprove).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  expect(onApprove).toHaveBeenCalledTimes(2);
});

it('holds a shortcut for a risky change and ignores it while typing', () => {
  const onApprove = vi.fn();
  render(
    <>
      <input aria-label="field" />
      <ApproveButton confirm description="" shortcut="a" onApprove={onApprove}>
        Hold
      </ApproveButton>
    </>,
  );
  fireEvent.keyDown(screen.getByLabelText('field'), { key: 'a' });
  vi.advanceTimersByTime(HOLD_MS);
  expect(onApprove).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: 'a' });
  vi.advanceTimersByTime(HOLD_MS - 100);
  fireEvent.keyUp(window, { key: 'a' });
  vi.advanceTimersByTime(HOLD_MS);
  expect(onApprove).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: 'a' });
  vi.advanceTimersByTime(HOLD_MS);
  expect(onApprove).toHaveBeenCalledTimes(1);
});
