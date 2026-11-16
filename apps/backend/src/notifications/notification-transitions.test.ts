import { describe, expect, it } from 'vitest';
import type { Service } from '@homora/shared';
import type { ServiceStatus } from '../monitoring/index.js';
import { createNotificationTransitions } from './notification-transitions.js';
import { serviceSignature } from '../monitoring/index.js';

const service = {
  id: 1,
  name: 'Example',
  category: 'Services',
  url: 'https://example.com',
} as Service;
function observation(status: ServiceStatus['status'], minute: number): ServiceStatus {
  return {
    status,
    lastAttempt: new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString(),
    reason:
      status === 'unknown' ? 'unchecked' : status === 'available' ? 'responding' : 'no-response',
    httpStatus: null,
    latencyMs: null,
  };
}

describe('notification transitions', () => {
  it('emits once per change, ignoring repeated publications and unknown checks', () => {
    const tracker = createNotificationTransitions();
    const check = (status: ServiceStatus['status'], minute: number) =>
      tracker.observe([service], { 1: observation(status, minute) });
    expect(check('available', 0)).toEqual([]);
    expect(check('unavailable', 1).map(({ event }) => event)).toEqual(['down']);
    expect(check('unavailable', 1)).toEqual([]);
    expect(check('unknown', 2)).toEqual([]);
    expect(check('available', 3).map(({ event }) => event)).toEqual(['up']);
    expect(check('available', 4)).toEqual([]);
  });

  it('suppresses short flaps but allows the recovery of an emitted outage', () => {
    const tracker = createNotificationTransitions();
    const check = (status: ServiceStatus['status'], minute: number) =>
      tracker.observe([service], { 1: observation(status, minute) }).map(({ event }) => event);
    expect(check('unavailable', 0)).toEqual(['down']);
    expect(check('available', 1)).toEqual(['up']);
    expect(check('unavailable', 2)).toEqual([]);
    expect(check('available', 3)).toEqual([]);
    expect(check('unavailable', 6)).toEqual(['down']);
  });

  it('treats changed monitoring configuration as a new baseline', () => {
    const tracker = createNotificationTransitions();
    tracker.observe([service], { 1: observation('unavailable', 0) });
    const changed = { ...service, url: 'https://example.org' };
    expect(tracker.observe([changed], { 1: observation('available', 1) })).toEqual([]);
  });

  it('waits for the failure threshold and alerts once per outage', () => {
    const tracker = createNotificationTransitions(300_000, [], () => ({
      failureThreshold: 3,
      recoveryThreshold: 2,
    }));
    const check = (status: ServiceStatus['status'], minute: number) =>
      tracker.observe([service], { 1: observation(status, minute) }).map(({ event }) => event);
    expect(check('unavailable', 0)).toEqual([]);
    expect(check('unavailable', 1)).toEqual([]);
    expect(check('unavailable', 2)).toEqual(['down']);
    expect(check('unavailable', 3)).toEqual([]);
    // One success is not a recovery yet; a failure in between keeps the same outage.
    expect(check('available', 4)).toEqual([]);
    expect(check('unavailable', 5)).toEqual([]);
    expect(check('available', 6)).toEqual([]);
    expect(check('available', 7)).toEqual(['up']);
  });

  it('keeps the first failure across restart and measures through confirmed recovery', () => {
    const thresholds = () => ({ failureThreshold: 2, recoveryThreshold: 2 });
    const tracker = createNotificationTransitions(0, [], thresholds);
    tracker.observe([service], { 1: observation('unavailable', 0) });
    tracker.observe([service], { 1: observation('unavailable', 1) });
    const restarted = createNotificationTransitions(0, tracker.snapshot(), thresholds);
    restarted.observe([service], { 1: observation('available', 2) });
    expect(restarted.observe([service], { 1: observation('available', 3) })).toMatchObject([
      { event: 'up', outageDurationMs: 180_000 },
    ]);
  });

  it('never alerts for failures that stop before the threshold', () => {
    const tracker = createNotificationTransitions(300_000, [], () => ({
      failureThreshold: 3,
      recoveryThreshold: 1,
    }));
    const check = (status: ServiceStatus['status'], minute: number) =>
      tracker.observe([service], { 1: observation(status, minute) }).map(({ event }) => event);
    expect(check('unavailable', 0)).toEqual([]);
    expect(check('unavailable', 1)).toEqual([]);
    expect(check('available', 2)).toEqual([]);
    expect(check('unavailable', 3)).toEqual([]);
    expect(check('unavailable', 4)).toEqual([]);
    expect(check('available', 5)).toEqual([]);
  });

  it('does not repeat the alert of an outage that was already open before thresholds existed', () => {
    const saved = {
      signature: serviceSignature(service),
      attempt: observation('unavailable', 0).lastAttempt!,
      status: 'unavailable' as const,
      lastDown: Date.UTC(2026, 0, 1, 0, 0),
      notifiedDown: true,
    };
    const tracker = createNotificationTransitions(0, [[1, saved]], () => ({
      failureThreshold: 3,
      recoveryThreshold: 1,
    }));
    expect(tracker.observe([service], { 1: observation('unavailable', 10) })).toEqual([]);
    expect(
      tracker.observe([service], { 1: observation('available', 11) }).map(({ event }) => event),
    ).toEqual(['up']);
  });
});
