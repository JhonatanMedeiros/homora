import { round } from './common.js';

/* ---------------------------------------------------------------- reporting */

export type SuiteResult = { suite: string; title: string; data: unknown; notes: string[] };

export function table(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '(sem dados)';
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (value: unknown) =>
    value === undefined
      ? '-'
      : typeof value === 'object' && value !== null
        ? JSON.stringify(value)
        : String(value);
  const widths = keys.map((k) => Math.max(k.length, ...rows.map((r) => cell(r[k]).length)));
  const line = (values: string[]) =>
    '| ' + values.map((v, i) => v.padEnd(widths[i] ?? 0)).join(' | ') + ' |';
  return [
    line(keys),
    '|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|',
    ...rows.map((r) => line(keys.map((k) => cell(r[k])))),
  ].join('\n');
}

export const log = (message: string) =>
  process.stderr.write(`[bench ${new Date().toISOString().slice(11, 19)}] ${message}\n`);

export function timeSync<T>(fn: () => T): { value: T; ms: number } {
  const startedAt = process.hrtime.bigint();
  const value = fn();
  return { value, ms: round(Number(process.hrtime.bigint() - startedAt) / 1e6, 2) };
}

export async function timeAsync<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const startedAt = process.hrtime.bigint();
  const value = await fn();
  return { value, ms: round(Number(process.hrtime.bigint() - startedAt) / 1e6, 2) };
}
