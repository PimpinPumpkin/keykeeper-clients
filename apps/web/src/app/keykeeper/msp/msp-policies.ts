// Keykeeper: how the MSP console shows default policies. A client follows a
// default while its policy matches it; the server says where a client has its
// own setting instead. See DESIGN.md, "Default policies".

import { DefaultPolicyResult, MspPolicies, MspPolicy } from "./msp-api.service";

type NamedClient = { id: string; name: string };

/** One policy in Default policies: the default, and the clients with their own setting. */
export type DefaultPolicyRow = {
  type: number;
  default: MspPolicy;
  own: NamedClient[];
};

/** The rows for the policy types shown, in that order. */
export function defaultPolicyRows(policies: MspPolicies, shown: number[]): DefaultPolicyRow[] {
  return shown
    .filter((type) => policies.types.includes(type))
    .map((type) => ({
      type,
      default: policies.defaults.find((p) => p.type === type) ?? {
        type,
        enabled: false,
        data: null,
      },
      own: policies.clients
        .filter((c) => c.own.some((p) => p.type === type))
        .map(({ id, name }) => ({ id, name })),
    }));
}

/** A client's policies in a few words: the defaults, or how many are its own. */
export function clientPolicySummary(
  policies: MspPolicies | null,
  clientId: string,
  shown: number[],
): string {
  const client = policies?.clients.find((c) => c.id === clientId);
  if (client == null) {
    return "";
  }
  const own = client.own.filter((p) => shown.includes(p.type)).length;
  if (own === 0) {
    return "Defaults";
  }
  return own === 1 ? "1 own setting" : `${own} own settings`;
}

/** Client names in a sentence: "A", "A and B", "A, B, and C", or a count past three. */
export function clientList(clients: NamedClient[]): string {
  const names = clients.map((c) => c.name);
  if (names.length > 3) {
    return `${names.length} clients`;
  }
  if (names.length <= 2) {
    return names.join(" and ");
  }
  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

/** What changing a default or using it in clients did. */
export function describePolicyResult(result: Partial<DefaultPolicyResult>): string {
  const changed = result.changed ?? [];
  const kept = result.kept ?? [];
  const refused = result.refused ?? [];
  const parts = [
    changed.length === 0 ? "No client needed a change." : `Changed in ${clientList(changed)}.`,
  ];
  if (kept.length > 0) {
    parts.push(`${clientList(kept)} kept ${kept.length === 1 ? "its" : "their"} own setting.`);
  }
  for (const r of refused) {
    parts.push(`${r.name} refused it: ${r.error}`);
  }
  return parts.join(" ");
}
