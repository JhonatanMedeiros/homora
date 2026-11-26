import Markdown from 'react-markdown';
import { useWidgetHost } from '../../../ui/host.js';
import type { ComponentProps } from 'react';

function SafeLink({ href, children }: ComponentProps<'a'>) {
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ) : (
    <>{children}</>
  );
}

/** React renders text safely; only this subset and absolute HTTP(S) links are allowed. */
export function NoteContent({ text }: { text: string }) {
  const { t } = useWidgetHost();
  if (!text.trim())
    return <p className="text-sm text-muted-foreground">{t('pageWidgets.noteEmpty')}</p>;
  return (
    <div className="flex min-w-0 flex-col gap-2 break-words text-sm [&_a]:text-accent-text [&_a]:underline [&_p]:whitespace-pre-line [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
      <Markdown
        skipHtml
        allowedElements={['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'a']}
        unwrapDisallowed
        urlTransform={(url) => {
          try {
            const parsed = new URL(url);
            return (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
              !parsed.username &&
              !parsed.password
              ? url
              : '';
          } catch {
            return '';
          }
        }}
        components={{ a: SafeLink }}
      >
        {text}
      </Markdown>
    </div>
  );
}
