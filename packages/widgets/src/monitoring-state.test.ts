import { expect, it } from 'vitest';
import { monitoringState } from './index.js';

it('classifies monitor facts without guessing an outage', () => {
  expect(monitoringState({ blocked: false })).toBe('unknown');
  expect(monitoringState({ status: 'unavailable', blocked: true })).toBe('blocked');
  expect(
    monitoringState({ status: 'unavailable', reason: 'destination-blocked', blocked: false }),
  ).toBe('blocked');
  expect(
    monitoringState({
      status: 'unavailable',
      reason: 'network',
      measurementReason: 'network',
      blocked: false,
    }),
  ).toBe('blocked');
  expect(monitoringState({ status: 'unavailable', reason: 'maintenance', blocked: true })).toBe(
    'maintenance',
  );
  expect(monitoringState({ status: 'unavailable', blocked: false })).toBe('down');
  expect(
    monitoringState({
      status: 'available',
      latencyMs: 101,
      degradedLatencyMs: 100,
      blocked: false,
    }),
  ).toBe('degraded');
  expect(
    monitoringState({ status: 'available', latencyMs: 100, degradedLatencyMs: 100, blocked: true }),
  ).toBe('ok');
});
