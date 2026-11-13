import { definePresentation, type WidgetStat } from '../../frontend.js';

type Key =
  | 'stat.node'
  | 'stat.nodeUnavailable'
  | 'stat.vms'
  | 'stat.lxc'
  | 'stat.cpu'
  | 'stat.memory'
  | 'stat.disk';

export function createProxmoxPresentation(t: (key: Key) => string) {
  function stats(value: unknown): WidgetStat[] | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const data = value as Record<string, unknown>;
    // A selected node that is missing or offline: say so, never show the cluster totals.
    if (data.unavailable === true)
      return [{ label: t('stat.node'), value: t('stat.nodeUnavailable') }];
    const count = (v: unknown): v is number =>
      typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
    const group = (v: unknown): v is { running: number; total: number } =>
      !!v &&
      typeof v === 'object' &&
      count((v as Record<string, unknown>).running) &&
      count((v as Record<string, unknown>).total);
    const share = (v: unknown): v is number | null =>
      v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100);
    if (!group(data.vms) || !group(data.containers) || !share(data.cpu) || !share(data.memory))
      return null;
    // Responses from older versions lacked disk metric; treat as absent.
    const disk = data.disk === undefined ? null : data.disk;
    if (!share(disk)) return null;
    const stats: WidgetStat[] = [
      { label: t('stat.vms'), value: `${data.vms.running} / ${data.vms.total}` },
      { label: t('stat.lxc'), value: `${data.containers.running} / ${data.containers.total}` },
    ];
    if (data.cpu !== null) stats.push({ id: 'cpu', label: t('stat.cpu'), value: `${data.cpu}%` });
    if (data.memory !== null)
      stats.push({ id: 'memory', label: t('stat.memory'), value: `${data.memory}%` });
    if (disk !== null) stats.push({ id: 'disk', label: t('stat.disk'), value: `${disk}%` });
    return stats;
  }

  return definePresentation({ stats, placeholderCount: 5 });
}
