import { describe, expect, it } from 'vitest';
import type { Service } from '@homora/shared';
import type { ServiceStatus } from './service-monitor.js';
import { createNotificationTransitions } from './notification-transitions.js';

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
});
