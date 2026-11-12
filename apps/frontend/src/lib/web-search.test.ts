import { expect, it } from 'vitest';
import { buildSearchUrl, engineTemplate, SEARCH_ENGINES, templateProblem } from './web-search';

it('encodes only the typed text into the template', () => {
  expect(buildSearchUrl('https://duckduckgo.com/?q=%s', 'jelly fin & co/é')).toBe(
    'https://duckduckgo.com/?q=jelly%20fin%20%26%20co%2F%C3%A9',
  );
});

it('supports the placeholder in the path and keeps replacement patterns literal', () => {
  expect(buildSearchUrl('https://example.com/s/%s/web', '$& a')).toBe(
    'https://example.com/s/%24%26%20a/web',
  );
});

it('trims the text and refuses an empty one', () => {
  expect(buildSearchUrl('https://example.com/?q=%s', '  hi  ')).toBe('https://example.com/?q=hi');
  expect(buildSearchUrl('https://example.com/?q=%s', '   ')).toBeNull();
});

it('rejects templates that are unsafe or incomplete', () => {
  expect(templateProblem('https://example.com/?q=')).toBe('placeholder');
  expect(templateProblem('javascript:alert(%s)')).toBe('protocol');
  expect(templateProblem('data:text/html,%s')).toBe('protocol');
  expect(templateProblem('http://example.com/?q=%s')).toBe('protocol');
  expect(templateProblem('not a url %s')).toBe('invalid');
  expect(templateProblem('https://%s.example.com/')).toBe('invalid');
  expect(templateProblem('https://%s/')).toBe('invalid');
  expect(templateProblem('https://user:pw@example.com/?q=%s')).toBe('invalid');
  expect(buildSearchUrl('javascript:alert(%s)', 'x')).toBeNull();
  expect(templateProblem('https://example.com/?q=%s')).toBeNull();
});

it('every built-in engine is a valid template', () => {
  for (const engine of SEARCH_ENGINES) expect(templateProblem(engine.template)).toBeNull();
});

it('uses the custom URL only when it is valid', () => {
  expect(engineTemplate('custom', 'https://example.com/?q=%s')).toBe('https://example.com/?q=%s');
  expect(engineTemplate('custom', 'http://example.com/?q=%s')).toBeNull();
  expect(engineTemplate('google', '')).toContain('google.com');
});
