import type { ServiceInput } from '@homora/shared';

const DRAFT_KEY = 'homora-service-draft';

/** The card fields typed in this tab; kept only until the form is saved or discarded. */
export function readDraft(id: number | null): ServiceInput | null {
  try {
    const stored = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null') as {
      id: number | null;
      form: ServiceInput;
    } | null;
    return stored && stored.id === id && typeof stored.form?.url === 'string' ? stored.form : null;
  } catch {
    return null;
  }
}
export function writeDraft(id: number | null, form: ServiceInput) {
  try {
    // An address carrying credentials is refused by the server, and is not stored here either.
    if (/\/\/[^/]*@/.test(form.url)) return;
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ id, form }));
  } catch {
    /* storage unavailable: the draft lasts as long as the form */
  }
}
export function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* storage unavailable */
  }
}
