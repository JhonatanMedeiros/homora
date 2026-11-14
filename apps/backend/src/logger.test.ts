import { describe, expect, it } from 'vitest';
import { buildInfo } from './logger.js';

describe('buildInfo', () => {
  it('prefers HOMORA_BUILD_COMMIT over SOURCE_COMMIT', () => {
    expect(buildInfo({ HOMORA_BUILD_COMMIT: 'aaa', SOURCE_COMMIT: 'bbb' }).commit).toBe('aaa');
  });

  it('falls back to SOURCE_COMMIT', () => {
    expect(buildInfo({ SOURCE_COMMIT: 'bbb' }).commit).toBe('bbb');
  });

  it('treats the Dockerfile default "unknown" and blanks as unset', () => {
    expect(buildInfo({ HOMORA_BUILD_COMMIT: 'unknown', SOURCE_COMMIT: 'bbb' }).commit).toBe('bbb');
    expect(buildInfo({ HOMORA_BUILD_COMMIT: '  ', SOURCE_COMMIT: 'bbb' }).commit).toBe('bbb');
  });

  it('reports "unknown" when nothing is set', () => {
    expect(buildInfo({}).commit).toBe('unknown');
  });

  it('keeps the version from package.json regardless of the commit', () => {
    const withCommit = buildInfo({ SOURCE_COMMIT: 'bbb' });
    expect(withCommit.version).toBe(buildInfo({}).version);
    expect(withCommit.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
