import { normalizeTag, TAG_MAX_LENGTH, TAGS_MAX_PER_SERVICE } from '@homora/shared';
import { X } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { t } from '@/i18n';

type Props = { id: string; value: string[]; onChange: (tags: string[]) => void };

/** Type a tag and press Enter or comma; Backspace on an empty field removes the last one. */
export function TagInput({ id, value, onChange }: Props) {
  const [draft, setDraft] = useState('');
  function commit() {
    const tag = normalizeTag(draft);
    setDraft('');
    if (tag && !value.includes(tag) && value.length < TAGS_MAX_PER_SERVICE)
      onChange([...value, tag]);
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Backspace' && draft === '' && value.length > 0)
      onChange(value.slice(0, -1));
  }
  return (
    <div className="flex flex-col gap-2">
      <Input
        id={id}
        value={draft}
        maxLength={TAG_MAX_LENGTH}
        autoComplete="off"
        disabled={value.length >= TAGS_MAX_PER_SERVICE}
        placeholder={t('form.tagsPlaceholder')}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
      />
      {value.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {value.map((tag) => (
            <li key={tag}>
              <Badge variant="secondary" className="gap-1 pr-1">
                {tag}
                <button
                  type="button"
                  aria-label={t('form.tagRemove', { tag })}
                  className="grid size-4 place-items-center rounded-sm hover:bg-foreground/10 pointer-coarse:size-6"
                  onClick={() => onChange(value.filter((item) => item !== tag))}
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
