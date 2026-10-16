// Keykeeper: sentences for the MSP audit log in the console.

export type MspEvent = {
  id: string;
  date: string;
  event: string;
  actorEmail: string | null;
  organizationId: string | null;
  organizationName: string | null;
  targetEmail: string | null;
  detail: string | null;
  ip: string | null;
};

const roleName = (role: string | null) => (role === "admin" ? "an admin" : "a technician");

/**
 * What happened, in one sentence. Template events record only the template's
 * id (the server never sees its name), so `templateName` supplies the names
 * the person can see.
 */
export function describeEvent(
  e: MspEvent,
  templateName: (templateId: string) => string | undefined = () => undefined,
): string {
  const actor = e.actorEmail ?? "Someone";
  const org = e.organizationName || "a client";
  const target = e.targetEmail ?? "someone";
  // Template details are "<template id>:<clients>", or just the id.
  const detail = e.detail ?? "";
  const colon = detail.indexOf(":");
  const templateId = colon < 0 ? detail : detail.slice(0, colon);
  const clients = colon < 0 ? "" : detail.slice(colon + 1);
  const template = templateName(templateId) ?? "a template";
  switch (e.event) {
    case "msp_created":
      return `${actor} set up ${e.detail ?? "the MSP"}`;
    case "client_created":
      // Clients added before default policies started with "Business defaults".
      return `${actor} added the client ${org}${e.detail === "Default policies" || e.detail === "Business defaults" ? " with the default policies" : ""}`;
    case "default_policy_changed":
      return `${actor} set the default ${e.detail ?? "policy"}`;
    case "template_added":
      return `${actor} started sending ${template} to ${clients || "clients"}`;
    case "template_changed":
      return `${actor} now sends ${template} to ${clients || "clients"}`;
    case "template_sent":
      return `${actor} sent ${template} to ${e.organizationName || clients || "clients"}`;
    case "template_stopped":
      return `${actor} stopped sending ${template}`;
    case "client_policy_default":
      return `${actor} put ${org} back on the default ${e.detail ?? "policy"}`;
    case "staff_added":
      return `${actor} added ${target} as ${roleName(e.detail)}`;
    case "staff_invited":
      return `${actor} invited ${target} to join as ${roleName(e.detail)}`;
    case "staff_invite_accepted":
      return `${target} accepted the invitation and joined as ${roleName(e.detail)}`;
    case "staff_invite_cancelled":
      return `${actor} cancelled the invitation for ${target}`;
    case "staff_role_changed":
      return `${actor} made ${target} ${roleName(e.detail)}`;
    case "staff_access_changed":
      return `${actor} set ${target}'s access: ${e.detail ?? "changed"}`;
    case "staff_removed":
      return `${actor} removed ${target} from the MSP and every client`;
    case "install_token_replaced":
      return `${actor} replaced the install token for ${org}`;
    case "joined_with_install_command":
      return `${target} joined ${org} with the install command`;
    case "member_confirmed":
      return `${actor} confirmed ${target} in ${org}`;
    case "client_removed_msp":
      return `${org} removed this MSP (${actor})`;
    default:
      return `${e.event} by ${actor}`;
  }
}
