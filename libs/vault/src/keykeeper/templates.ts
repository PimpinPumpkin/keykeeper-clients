// Keykeeper item templates: an item type plus a set of starting custom fields,
// like 1Password's API key or server items. A new item records the template it
// came from in a text field named TEMPLATE_FIELD_NAME, so its template can be
// shown later; everything else is ordinary custom fields, which the server and
// other clients store and show like any other.
//
// Custom templates are items too: a secure note with a text field named
// TEMPLATE_DEFINITION_FIELD_NAME. The note's name is the template's name and
// its custom fields are the template's fields, values included as defaults, so
// people create, edit, share, and delete templates with the ordinary item
// editor, and a template in an organization's collection reaches everyone who
// can see that collection.

import { CipherType, FieldType } from "@bitwarden/common/vault/enums";
import { FieldView } from "@bitwarden/common/vault/models/view/field.view";
import { newGuid } from "@bitwarden/guid";

import { visibleCustomFields } from "./reserved-fields";

export const TEMPLATE_FIELD_NAME = "keykeeper.template";
export const TEMPLATE_DEFINITION_FIELD_NAME = "keykeeper.template-definition";

export type TemplateFieldKind = "text" | "hidden" | "boolean";

export type TemplateField = { label: string; kind: TemplateFieldKind; value?: string };

export type TemplateBase = "login" | "note";

export type ItemTemplate = {
  id: string;
  name: string;
  /** An icon from the component library's icon font. */
  icon: string;
  /** The item type it builds on: a login (username, password, website) or a note. */
  base: TemplateBase;
  fields: TemplateField[];
  /** For a custom template: the item that defines it, and its organization if any. */
  source?: { cipherId: string; organizationId: string | null };
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

export function templateCipherType(template: Pick<ItemTemplate, "base">): CipherType {
  return template.base === "login" ? CipherType.Login : CipherType.SecureNote;
}

/** The starting custom fields for a new item from this template, marker included. */
export function templateFields(template: ItemTemplate): FieldView[] {
  const marker = new FieldView();
  marker.name = TEMPLATE_FIELD_NAME;
  marker.type = FieldType.Text;
  marker.value = JSON.stringify({ id: template.id, name: template.name, v: 1 });
  const fields = template.fields.map((f) => {
    const field = new FieldView();
    field.name = f.label;
    field.type =
      f.kind === "hidden"
        ? FieldType.Hidden
        : f.kind === "boolean"
          ? FieldType.Boolean
          : FieldType.Text;
    field.value = f.value ?? (f.kind === "boolean" ? "false" : "");
    return field;
  });
  return [...fields, marker];
}

type FieldLike = { name?: string | null; value?: string | null; type?: FieldType | null };
type ItemLike = { fields?: FieldLike[] | null } | null | undefined;

function parseJson(value: string | null | undefined): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value ?? "");
    return parsed != null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const TEMPLATE_ID = /^[A-Za-z0-9-]{1,64}$/;
const BASE_ICONS: Record<TemplateBase, string> = { login: "bwi-globe", note: "bwi-sticky-note" };

/** The definition field for a new custom template. */
export function newTemplateDefinitionField(base: TemplateBase, id = newGuid()): FieldView {
  const field = new FieldView();
  field.name = TEMPLATE_DEFINITION_FIELD_NAME;
  field.type = FieldType.Text;
  field.value = JSON.stringify({ id, base, v: 1 });
  return field;
}

/** The id and base type of a custom template item, or null for any other item. */
export function templateDefinition(item: ItemLike): { id: string; base: TemplateBase } | null {
  const definition = parseJson(
    (item?.fields ?? []).find((f) => f.name === TEMPLATE_DEFINITION_FIELD_NAME)?.value,
  );
  if (
    definition?.v !== 1 ||
    typeof definition.id !== "string" ||
    !TEMPLATE_ID.test(definition.id) ||
    (definition.base !== "login" && definition.base !== "note")
  ) {
    return null;
  }
  return { id: definition.id, base: definition.base };
}

type TemplateItem = {
  id?: string | null;
  name?: string | null;
  type?: CipherType | null;
  organizationId?: string | null;
  deletedDate?: Date | null;
  fields?: FieldLike[] | null;
};

/** The custom template an item defines, or null if it isn't one. */
export function customTemplate(item: TemplateItem): ItemTemplate | null {
  const definition = templateDefinition(item);
  if (definition == null || item.type !== CipherType.SecureNote || item.deletedDate != null) {
    return null;
  }
  const fields = visibleCustomFields(item.fields).flatMap((f): TemplateField[] => {
    const kind: TemplateFieldKind | null =
      f.type === FieldType.Hidden
        ? "hidden"
        : f.type === FieldType.Boolean
          ? "boolean"
          : f.type === FieldType.Text
            ? "text"
            : null;
    return kind == null ? [] : [{ label: f.name ?? "", kind, value: f.value ?? undefined }];
  });
  return {
    id: definition.id,
    name: item.name?.trim() || "Untitled template",
    icon: BASE_ICONS[definition.base],
    base: definition.base,
    fields,
    source: { cipherId: item.id ?? "", organizationId: item.organizationId ?? null },
  };
}

/** Every custom template among these items, by name. */
export function customTemplates(items: TemplateItem[]): ItemTemplate[] {
  return items
    .map(customTemplate)
    .filter((t): t is ItemTemplate => t != null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type TemplateGroup = { name: string; templates: readonly ItemTemplate[] };

/**
 * Templates to choose from, grouped: each organization's (by organization
 * name), then the person's own, then built-in. Empty groups are left out.
 */
export function templateGroups(
  items: TemplateItem[],
  organizations: { id: string; name: string }[],
): TemplateGroup[] {
  const custom = customTemplates(items);
  const groups: TemplateGroup[] = [...organizations]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((org) => ({
      name: org.name,
      templates: custom.filter((t) => t.source?.organizationId === org.id),
    }));
  groups.push({
    name: "My templates",
    templates: custom.filter((t) => t.source?.organizationId == null),
  });
  return [
    ...groups.filter((g) => g.templates.length > 0),
    { name: "Built-in", templates: BUILT_IN_TEMPLATES },
  ];
}

/**
 * The template an item was created from, if any. A built-in template comes
 * with its icon; a custom one is known by the name recorded when the item was
 * created, so it shows even to people who can't see the template itself.
 */
export function templateOf(item: ItemLike): Pick<ItemTemplate, "id" | "name" | "icon"> | null {
  const marker = parseJson((item?.fields ?? []).find((f) => f.name === TEMPLATE_FIELD_NAME)?.value);
  if (marker == null || typeof marker.id !== "string") {
    return null;
  }
  const builtIn = BUILT_IN_TEMPLATES.find((t) => t.id === marker.id);
  if (builtIn) {
    return builtIn;
  }
  return typeof marker.name === "string" && marker.name.trim() !== ""
    ? { id: marker.id, name: marker.name.trim(), icon: "bwi-file-text" }
    : null;
}
