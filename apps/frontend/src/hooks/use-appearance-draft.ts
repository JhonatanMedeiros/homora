import { useState } from 'react';
import {
  contrastProblems,
  isHexColor,
  type Appearance,
  type ContrastProblem,
} from '@homora/shared';
import { sameAppearance } from '@/lib/appearance';

const CUSTOM_FALLBACK = '#2f7d6b';

/** Local appearance draft and its validation, separate from server persistence. */
export function useAppearanceDraft(saved: Appearance) {
  const [lastSaved, setLastSaved] = useState(saved);
  const [draft, setDraft] = useState(saved);
  const [hexText, setHexText] = useState(saved.customAccent ?? CUSTOM_FALLBACK);
  const [error, setError] = useState('');

  // When the server store changes, replace the draft without an intermediate stale frame.
  if (saved !== lastSaved) {
    setLastSaved(saved);
    setDraft(saved);
    setHexText(saved.customAccent ?? CUSTOM_FALLBACK);
  }

  const hexValid = isHexColor(hexText);
  const candidate: Appearance | null =
    draft.accent === 'custom'
      ? hexValid
        ? { ...draft, customAccent: hexText.toLowerCase() }
        : null
      : { ...draft, customAccent: null };
  const problems: ContrastProblem[] = candidate ? contrastProblems(candidate) : [];
  const dirty = !candidate || !sameAppearance(candidate, saved);
  const blocked = problems.length > 0 || !candidate;

  function patch(change: Partial<Appearance>) {
    setError('');
    setDraft((current) => ({ ...current, ...change }));
  }

  function discard() {
    setError('');
    setDraft(saved);
    setHexText(saved.customAccent ?? CUSTOM_FALLBACK);
  }

  return {
    draft,
    setDraft,
    hexText,
    setHexText,
    hexValid,
    candidate,
    problems,
    dirty,
    blocked,
    error,
    setError,
    patch,
    discard,
  };
}
