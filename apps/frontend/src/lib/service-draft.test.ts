// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { clearDraft, readDraft, writeDraft } from '@/lib/service-draft';
import { emptyService } from '@/lib/services';

afterEach(() => sessionStorage.clear());

it('keeps what was typed for the same card until it is cleared', () => {
  const typed = { ...emptyService, name: 'NAS' };
  writeDraft(null, typed);
  expect(readDraft(null)).toEqual(typed);
  expect(readDraft(7)).toBeNull();
  clearDraft();
  expect(readDraft(null)).toBeNull();
});

it('never stores an address that carries credentials', () => {
  writeDraft(null, { ...emptyService, url: 'http://user:secret@nas.invalid' });
  expect(readDraft(null)).toBeNull();
});
