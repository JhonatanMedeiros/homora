import { expect, it } from 'vitest';
import { completeAddress, isServiceAddress } from '@/lib/service-address';

it.each([
  ['192.168.1.10:8096', 'http://192.168.1.10:8096'],
  ['media.invalid/web', 'http://media.invalid/web'],
  ['nas:5000', 'http://nas:5000'],
  ['localhost', 'http://localhost'],
  ['  https://a.example ', 'https://a.example'],
])('completes %s', (typed, expected) => expect(completeAddress(typed)).toBe(expected));

it.each(['not an address', 'ftp://x.invalid', 'mailto:someone', ''])('leaves %j alone', (typed) => {
  expect(completeAddress(typed)).toBe(typed);
  expect(isServiceAddress(typed)).toBe(false);
});

it('refuses credentials in the address', () => {
  expect(isServiceAddress('http://user:secret@x.invalid')).toBe(false);
});
