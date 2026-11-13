/** A description that only repeats the name ("Proxmox" / "Proxmox Phobos") adds nothing. */
export function repeatsName(name: string, description: string) {
  const n = name.trim().toLowerCase();
  const d = description.trim().toLowerCase();
  return d === n || (d.startsWith(`${n} `) && d.split(/\s+/).length <= 2);
}

/** Stable id for "go to card"; `data-highlight` is set for a moment by the command palette. */
export const SERVICE_LI =
  'group/service flex min-w-0 self-start scroll-mt-24 rounded-lg data-[highlight=true]:ring-2 data-[highlight=true]:ring-primary data-[highlight=true]:ring-offset-2 data-[highlight=true]:ring-offset-background';
export const SERVICE_CARD_LI = `${SERVICE_LI} mb-3 w-full break-inside-avoid-column`;
