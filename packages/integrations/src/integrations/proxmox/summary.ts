export type ProxmoxSummary = {
  vms: { running: number; total: number };
  containers: { running: number; total: number };
  /** CPU usage of online nodes, weighted by cores, as an integer percentage. */
  cpu: number | null;
  /** Memory usage of online nodes, as an integer percentage. */
  memory: number | null;
  /** Disk usage of online nodes (root filesystem of each node), as an integer percentage. */
  disk: number | null;
};

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const percent = (part: number, whole: number) =>
  whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : null;

/**
 * Summarizes cluster inventory for a card. Only aggregated numbers leave here: names, IDs,
 * and resource addresses never reach the browser through this path. Templates and
 * unexpectedly formatted items are ignored.
 */
export function summarizeProxmox(resources: unknown): ProxmoxSummary {
  const summary: ProxmoxSummary = {
    vms: { running: 0, total: 0 },
    containers: { running: 0, total: 0 },
    cpu: null,
    memory: null,
    disk: null,
  };
  let cores = 0;
  let usedCores = 0;
  let memory = 0;
  let usedMemory = 0;
  let disk = 0;
  let usedDisk = 0;
  if (!Array.isArray(resources)) return summary;
  for (const item of resources) {
    if (!item || typeof item !== 'object') continue;
    const resource = item as Record<string, unknown>;
    if (resource.type === 'qemu' || resource.type === 'lxc') {
      if (resource.template === 1) continue;
      const group = resource.type === 'qemu' ? summary.vms : summary.containers;
      group.total++;
      if (resource.status === 'running') group.running++;
    } else if (resource.type === 'node' && resource.status === 'online') {
      if (finite(resource.maxcpu) && finite(resource.cpu) && resource.maxcpu > 0) {
        cores += resource.maxcpu;
        usedCores += Math.min(resource.cpu, 1) * resource.maxcpu;
      }
      if (finite(resource.maxmem) && finite(resource.mem) && resource.maxmem > 0) {
        memory += resource.maxmem;
        usedMemory += Math.min(resource.mem, resource.maxmem);
      }
      if (finite(resource.maxdisk) && finite(resource.disk) && resource.maxdisk > 0) {
        disk += resource.maxdisk;
        usedDisk += Math.min(resource.disk, resource.maxdisk);
      }
    }
  }
  summary.cpu = percent(usedCores, cores);
  summary.memory = percent(usedMemory, memory);
  summary.disk = percent(usedDisk, disk);
  return summary;
}
