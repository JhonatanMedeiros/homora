import type { DatabaseSync } from 'node:sqlite';
import { summaryWidgetTypes } from '@homora/widgets/summary';

/** The Summary widget types as an SQL list; they are constants of the application. */
export const SUMMARY_TYPES_SQL = summaryWidgetTypes.map((type) => `'${type}'`).join(',');

/** Gives a page the widgets its Summary starts with. Must run inside the caller's transaction. */
export function seedSummaryWidgets(sqlite: DatabaseSync, pageId: number) {
  const insert = sqlite.prepare(
    "INSERT INTO page_widgets(page_id,type,name,config,version,connection_id,size,position) VALUES(?,?,'','{}',1,NULL,'normal',(SELECT COALESCE(MAX(position),-1)+1 FROM page_widgets WHERE page_id=?))",
  );
  for (const type of summaryWidgetTypes) insert.run(pageId, type, pageId);
}
