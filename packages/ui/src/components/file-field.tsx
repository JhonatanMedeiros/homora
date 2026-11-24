import { useRef, type ChangeEvent } from 'react';
import { FileText, Paperclip, X } from 'lucide-react';
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from '@homora/ui/attachment';

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Props = {
  id: string;
  accept: string;
  /** The chosen file, or an already saved one described by name and optional size. */
  value: { name: string; size?: number; description?: string } | null;
  disabled?: boolean;
  /** Receives the chosen file; the field never keeps it, the owner decides what to do with it. */
  onSelect: (file: File) => void;
  onClear: () => void;
  /** Text of the empty picker, already translated. */
  chooseLabel: string;
  /** Accessible name of the remove button for the given file name. */
  removeLabel: (name: string) => string;
};

/** Single-file field: a dashed picker while empty, a removable attachment once filled. */
export function FileField({
  id,
  accept,
  value,
  disabled,
  onSelect,
  onClear,
  chooseLabel,
  removeLabel,
}: Props) {
  const input = useRef<HTMLInputElement>(null);

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) onSelect(file);
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <input
        ref={input}
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        className="sr-only"
        tabIndex={-1}
        onChange={choose}
      />
      {value ? (
        <Attachment className="w-full">
          <AttachmentMedia>
            <FileText aria-hidden />
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>{value.name}</AttachmentTitle>
            {(value.description || value.size !== undefined) && (
              <AttachmentDescription>
                {value.description ?? formatFileSize(value.size ?? 0)}
              </AttachmentDescription>
            )}
          </AttachmentContent>
          <AttachmentActions>
            <AttachmentAction
              type="button"
              aria-label={removeLabel(value.name)}
              disabled={disabled}
              onClick={onClear}
            >
              <X aria-hidden />
            </AttachmentAction>
          </AttachmentActions>
        </Attachment>
      ) : (
        <Attachment state="idle" className="w-full">
          <AttachmentMedia>
            <Paperclip aria-hidden />
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>{chooseLabel}</AttachmentTitle>
            <AttachmentDescription>{accept.replaceAll(',', ' ')}</AttachmentDescription>
          </AttachmentContent>
          <AttachmentTrigger
            aria-label={chooseLabel}
            disabled={disabled}
            className="cursor-pointer rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50"
            onClick={() => input.current?.click()}
          />
        </Attachment>
      )}
    </div>
  );
}
