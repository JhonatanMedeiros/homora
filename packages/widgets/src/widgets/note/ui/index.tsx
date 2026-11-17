import { lazy, Suspense } from 'react';
import { NotebookPen } from 'lucide-react';
import { noteWidget, defaultNoteConfig, type NoteConfig } from '../../../note.js';
import { useWidgetHost } from '../../../ui/host.js';
import type { WidgetUI } from '../../../ui/types.js';
import { Editor } from './editor.js';

const NoteContent = lazy(() =>
  import('./view.js').then((module) => ({ default: module.NoteContent })),
);
function View({ config }: { config: unknown }) {
  const { t } = useWidgetHost();
  return (
    <Suspense
      fallback={
        <p role="status" className="text-sm text-muted-foreground">
          {t('common.loading')}
        </p>
      }
    >
      <NoteContent text={(config as NoteConfig).text} />
    </Suspense>
  );
}
export { Editor };
export const widgetUI: WidgetUI = {
  name: 'pageWidgets.note',
  description: 'pageWidgets.noteDesc',
  category: 'utilities',
  keywords: ['text', 'markdown', 'memo', 'nota', 'texto', 'lembrete'],
  defaultConfig: defaultNoteConfig,
  parse: noteWidget.parseConfig,
  View,
  Editor: ({ config, onChange }) => <Editor config={config as NoteConfig} onChange={onChange} />,
  Gallery: () => <NotebookPen aria-hidden="true" />,
};
