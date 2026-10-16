// Keykeeper: how the MSP console shows the item templates it sends. A
// client's copy is up to date when it was made from the source's current
// version (the source's revision date). See DESIGN.md, "MSP templates".

import { MspTemplates } from "./msp-api.service";

type NamedClient = { id: string; name: string };

/** What the console knows about an item it can decrypt. */
export type KnownItem = {
  name: string;
  /** The item's revision date, as the server reports it. */
  revision: string;
  deleted: boolean;
  organizationId: string | null;
};

export type TemplateRow = {
  templateId: string;
  /** The template's name, or null when the person sees neither the source nor a copy. */
  name: string | null;
  sourceCipherId: string;
  /** Whether the person can see the source, and so can update copies. */
  sourceVisible: boolean;
  allClients: boolean;
  /** The clients it goes to, among those the person sees. */
  targets: NamedClient[];
  upToDate: NamedClient[];
  /** Clients without a copy, or with a copy older than the source. */
  behind: NamedClient[];
};

export function templateRows(
  state: MspTemplates,
  clients: NamedClient[],
  items: Map<string, KnownItem>,
): TemplateRow[] {
  return state.templates.map((t) => {
    const source = items.get(t.sourceCipherId);
    const sourceVisible = source != null && !source.deleted;
    const targets = t.allClients ? clients : clients.filter((c) => t.clients.includes(c.id));
    const upToDate: NamedClient[] = [];
    const behind: NamedClient[] = [];
    let copyName: string | null = null;
    for (const client of targets) {
      const record = state.copies.find(
        (c) => c.organizationId === client.id && c.templateId === t.templateId,
      );
      const copy = record ? items.get(record.cipherId) : undefined;
      const live = copy != null && !copy.deleted && copy.organizationId === client.id;
      if (live) {
        copyName ??= copy.name;
      }
      // Without the source there's no newer version to compare with.
      const current = live && (!sourceVisible || record!.sourceRevision === source.revision);
      (current ? upToDate : behind).push(client);
    }
    return {
      templateId: t.templateId,
      name: sourceVisible ? source.name : copyName,
      sourceCipherId: t.sourceCipherId,
      sourceVisible,
      allClients: t.allClients,
      targets,
      upToDate,
      behind,
    };
  });
}

/** A template's status in a few words. */
export function templateStatus(row: TemplateRow): string {
  if (row.targets.length === 0) {
    return "No clients yet";
  }
  if (row.behind.length === 0) {
    return "Up to date";
  }
  return `Needs updating in ${row.behind.length} of ${row.targets.length} ${row.targets.length === 1 ? "client" : "clients"}`;
}

/** Who a template goes to, in a few words. */
export function templateTargets(row: Pick<TemplateRow, "allClients" | "targets">): string {
  if (row.allClients) {
    return "Every client";
  }
  const names = row.targets.map((c) => c.name);
  return names.length > 3 ? `${names.length} clients` : names.join(", ");
}
