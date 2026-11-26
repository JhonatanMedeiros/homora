import { expect, it } from 'vitest';
import { firstCharacter } from './text.js';

it.each([
  ['Plex', 'P'],
  ['🎬 Media', '🎬'],
  ['👨‍👩‍👧 Family', '👨‍👩‍👧'],
  ['', ''],
])('takes the first visible character of %j', (value, expected) => {
  expect(firstCharacter(value)).toBe(expected);
});
