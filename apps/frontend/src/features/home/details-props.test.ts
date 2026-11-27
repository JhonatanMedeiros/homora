import { describe, expect, it } from 'vitest';
import type { Service } from '@homora/shared';
import { defaultSelection } from '@/features/home/details-props';

const service = (id: number, pinned = false) => ({ id, pinned }) as Service;
const services = [service(1), service(2, true), service(3), service(4)];
const down = (item: Service) => item.id >= 3;

describe('defaultSelection', () => {
  it('prefers a problem nobody acknowledged', () => {
    expect(defaultSelection(services, down, (id) => id === 3)?.id).toBe(4);
  });

  it('keeps an acknowledged problem ahead of a favorite', () => {
    expect(defaultSelection(services, down, () => true)?.id).toBe(3);
  });

  it('falls back to a favorite, then to the first service, then to nothing', () => {
    const healthy = () => false;
    expect(defaultSelection(services, healthy, healthy)?.id).toBe(2);
    expect(defaultSelection([service(7)], healthy, healthy)?.id).toBe(7);
    expect(defaultSelection([], healthy, healthy)).toBeNull();
  });
});
