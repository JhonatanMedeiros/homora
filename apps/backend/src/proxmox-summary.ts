export type ProxmoxSummary = {
  vms: { running: number; total: number };
  containers: { running: number; total: number };
  /** Uso de CPU dos nós online, ponderado pelos núcleos, em porcentagem inteira. */
  cpu: number | null;
  /** Memória usada dos nós online, em porcentagem inteira. */
  memory: number | null;
};

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const percent = (part: number, whole: number) =>
  whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : null;

/**
 * Resume o inventário do cluster para um card. Só números agregados saem daqui: nomes, IDs e
 * endereços dos recursos nunca chegam ao navegador por este caminho. Modelos (templates) e
 * itens fora do formato esperado são ignorados.
 */
export function summarizeProxmox(resources: unknown): ProxmoxSummary {
  const summary: ProxmoxSummary = {
    vms: { running: 0, total: 0 },
    containers: { running: 0, total: 0 },
    cpu: null,
    memory: null,
  };
  let cores = 0;
  let usedCores = 0;
  let memory = 0;
  let usedMemory = 0;
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
    }
  }
  summary.cpu = percent(usedCores, cores);
  summary.memory = percent(usedMemory, memory);
  return summary;
}
