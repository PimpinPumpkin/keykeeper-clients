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

/** What happened, in one sentence. */
export function describeEvent(e: MspEvent): string {
  const actor = e.actorEmail ?? "Someone";
  const org = e.organizationName || "a client";
  const target = e.targetEmail ?? "someone";
  switch (e.event) {
    case "msp_created":
      return `${actor} set up ${e.detail ?? "the MSP"}`;
    case "client_created":
      return `${actor} added the client ${org}${e.detail === "Business defaults" ? " with Business defaults" : ""}`;
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
