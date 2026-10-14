// Keykeeper item templates: an item type plus a set of predefined custom
// fields, like 1Password's API key or server items. A new item records the
// template it came from in a text field named TEMPLATE_FIELD_NAME, so its
// template can be shown later; everything else is ordinary custom fields, which
// the server and other clients store and show like any other.

import { CipherType, FieldType } from "@bitwarden/common/vault/enums";
import { FieldView } from "@bitwarden/common/vault/models/view/field.view";

export const TEMPLATE_FIELD_NAME = "keykeeper.template";

export type TemplateFieldKind = "text" | "hidden" | "boolean";

export type TemplateField = { label: string; kind: TemplateFieldKind };

export type ItemTemplate = {
  id: string;
  name: string;
  /** An icon from the component library's icon font. */
  icon: string;
  /** The item type it builds on: a login (username, password, website) or a note. */
  base: "login" | "note";
  fields: TemplateField[];
};

const text = (label: string): TemplateField => ({ label, kind: "text" });
const hidden = (label: string): TemplateField => ({ label, kind: "hidden" });
const yesNo = (label: string): TemplateField => ({ label, kind: "boolean" });

// English until Keykeeper's own strings are translated.
export const BUILT_IN_TEMPLATES: readonly ItemTemplate[] = [
  {
    id: "api-key",
    name: "API key",
    icon: "bwi-key",
    base: "note",
    fields: [hidden("Key"), hidden("Secret"), text("Service URL"), text("Scopes")],
  },
  {
    id: "server",
    name: "Server",
    icon: "bwi-terminal",
    base: "login",
    fields: [text("Hostname"), text("Port"), text("Operating system")],
  },
  {
    id: "database",
    name: "Database",
    icon: "bwi-list-alt",
    base: "login",
    fields: [text("Type"), text("Hostname"), text("Port"), text("Database name")],
  },
  {
    id: "wifi",
    name: "Wi-Fi network",
    icon: "bwi-wireless",
    base: "note",
    fields: [text("Network name"), hidden("Password"), text("Security type")],
  },
  {
    id: "router",
    name: "Router",
    icon: "bwi-globe",
    base: "login",
    fields: [text("Network name"), hidden("Wi-Fi password")],
  },
  {
    id: "software-license",
    name: "Software license",
    icon: "bwi-file-text",
    base: "note",
    fields: [hidden("License key"), text("Licensed to"), text("Version"), text("Purchase date")],
  },
  {
    id: "domain",
    name: "Domain",
    icon: "bwi-globe",
    base: "login",
    fields: [text("Domain name"), text("Registrar"), yesNo("Auto-renew")],
  },
  {
    id: "certificate",
    name: "Certificate",
    icon: "bwi-lock",
    base: "note",
    fields: [text("Common name"), text("Issuer"), hidden("Private key")],
  },
  {
    id: "email-account",
    name: "Email account",
    icon: "bwi-envelope",
    base: "login",
    fields: [text("Incoming server"), text("Outgoing server"), text("Port")],
  },
  {
    id: "membership",
    name: "Membership",
    icon: "bwi-id-card",
    base: "note",
    fields: [text("Organization"), text("Member ID"), text("Phone")],
  },
];

export function templateCipherType(template: ItemTemplate): CipherType {
  return template.base === "login" ? CipherType.Login : CipherType.SecureNote;
}

/** The starting custom fields for a new item from this template, marker included. */
export function templateFields(template: ItemTemplate): FieldView[] {
  const marker = new FieldView();
  marker.name = TEMPLATE_FIELD_NAME;
  marker.type = FieldType.Text;
  marker.value = JSON.stringify({ id: template.id, v: 1 });
  const fields = template.fields.map((f) => {
    const field = new FieldView();
    field.name = f.label;
    field.type =
      f.kind === "hidden"
        ? FieldType.Hidden
        : f.kind === "boolean"
          ? FieldType.Boolean
          : FieldType.Text;
    field.value = f.kind === "boolean" ? "false" : "";
    return field;
  });
  return [...fields, marker];
}

/** The built-in template an item was created from, if any. */
export function templateOf(
  item: { fields?: { name?: string | null; value?: string | null }[] | null } | null | undefined,
): ItemTemplate | null {
  const value = (item?.fields ?? []).find((f) => f.name === TEMPLATE_FIELD_NAME)?.value;
  try {
    const id = JSON.parse(value ?? "")?.id;
    return BUILT_IN_TEMPLATES.find((t) => t.id === id) ?? null;
  } catch {
    return null;
  }
}
