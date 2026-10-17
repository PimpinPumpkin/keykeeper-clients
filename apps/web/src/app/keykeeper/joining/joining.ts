// Keykeeper: wording for how people join an organization. See DESIGN.md, "Joining".
import { Joining } from "@bitwarden/admin-console/common";

/** The lifetimes the settings offer, in hours. The server allows 1 to 720. */
export const INVITE_CHOICES = [2, 24, 120];

/** "2 hours", "1 day", "5 days", as the server's invitation emails say it. */
export function lifetime(hours: number): string {
  if (hours % 24 === 0) {
    const days = hours / 24;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

/** The offered lifetimes, plus the current one if it's something else. */
export function inviteChoices(current: number): { hours: number; label: string }[] {
  const hours = INVITE_CHOICES.includes(current)
    ? INVITE_CHOICES
    : [...INVITE_CHOICES, current].sort((a, b) => a - b);
  return hours.map((h) => ({ hours: h, label: lifetime(h) }));
}

/** One line, for lists and the activity log. */
export function describeJoining(joining: Joining): string {
  return `${joining.autoConfirm ? "Let in automatically" : "An admin approves each one"}; invitations last ${lifetime(joining.inviteHours)}`;
}
