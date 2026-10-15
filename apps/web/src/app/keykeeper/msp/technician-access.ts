// Keykeeper: what an MSP technician gets in the MSP's clients, in words, and
// the choices the console offers. See DESIGN.md, "Roles and permissions".

import { CustomPermissions, TechnicianAccess } from "./msp-api.service";

/** Every client, as admin, with install commands: what a technician gets unless limited. */
export const DEFAULT_ACCESS: TechnicianAccess = {
  allClients: true,
  clients: [],
  custom: null,
  installCommands: true,
};

/** The custom role permissions the server enforces, with upstream's labels (i18n keys). */
export const PERMISSIONS: { key: keyof CustomPermissions; label: string }[] = [
  { key: "manageUsers", label: "manageUsers" },
  { key: "manageResetPassword", label: "manageAccountRecovery" },
  { key: "managePolicies", label: "managePolicies" },
  { key: "accessEventLogs", label: "accessEventLogs" },
  { key: "accessImportExport", label: "accessImportExport" },
];

export const NO_PERMISSIONS: CustomPermissions = {
  manageUsers: false,
  manageResetPassword: false,
  managePolicies: false,
  accessEventLogs: false,
  accessImportExport: false,
};

/** A technician's access in one line, for the staff table. */
export function describeAccess(
  access: TechnicianAccess,
  clients: { id: string; name: string }[],
): string {
  const names = access.clients
    .map((id) => clients.find((c) => c.id === id)?.name)
    .filter((name): name is string => name != null)
    .sort((a, b) => a.localeCompare(b));
  const reach = access.allClients
    ? "Every client"
    : names.length === 0
      ? "No clients"
      : names.join(", ");
  const role =
    access.custom == null
      ? "Admin"
      : access.custom.vaultItems
        ? "Custom role with vault items"
        : "Custom role";
  const install = access.installCommands ? "Install commands" : "No install commands";
  return `${reach} · ${role} · ${install}`;
}

/** Whether access reaches every client, for the toast after adding someone. */
export function reachesEveryClient(access: TechnicianAccess | undefined): boolean {
  return access == null || access.allClients;
}
