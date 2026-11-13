import { describe, expect, it } from 'vitest';
import { matchesJson, matchesKeyword } from './check-body.js';

describe('keyword', () => {
  it('ignores case and finds the text anywhere', () => {
    expect(matchesKeyword('<h1>All Systems GO</h1>', 'systems go')).toBe(true);
    expect(matchesKeyword('maintenance', 'ok')).toBe(false);
  });
});

describe('json', () => {
  const body = JSON.stringify({
    status: 'ok',
    data: { up: true, n: 3, list: [{ id: 7 }] },
    nil: null,
  });
  it('compares the printed value at a dotted path', () => {
    expect(matchesJson(body, 'status=ok')).toBe(true);
    expect(matchesJson(body, 'data.up=true')).toBe(true);
    expect(matchesJson(body, 'data.n=3')).toBe(true);
    expect(matchesJson(body, 'data.list.0.id=7')).toBe(true);
    expect(matchesJson(body, 'status=down')).toBe(false);
  });
  it('treats a bare path as "exists and is not null or false"', () => {
    expect(matchesJson(body, 'data.up')).toBe(true);
    expect(matchesJson(body, 'nil')).toBe(false);
    expect(matchesJson(body, 'missing')).toBe(false);
  });
  it('fails on invalid JSON, empty paths, objects and inherited keys', () => {
    expect(matchesJson('<html>', 'status=ok')).toBe(false);
    expect(matchesJson(body, '=ok')).toBe(false);
    expect(matchesJson(body, 'data=[object Object]')).toBe(false);
    expect(matchesJson(body, 'constructor.name=Object')).toBe(false);
    expect(matchesJson(body, '__proto__')).toBe(false);
  });
});
