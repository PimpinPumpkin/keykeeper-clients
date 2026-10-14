// Keykeeper fill rules: "fill this field with that value" and "never fill this
// field", chosen by the user and stored inside the item, so they are encrypted
// like the rest of the item and sync to every device.
//
// A rule is a hidden custom field named FILL_RULE_FIELD_NAME whose value is a
// small JSON document. Using a custom field keeps the server and other clients
// compatible: they store and sync it like any other field.

import { FieldType } from "@bitwarden/common/vault/enums";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { FieldView } from "@bitwarden/common/vault/models/view/field.view";

import AutofillField from "../models/autofill-field";
import AutofillPageDetails from "../models/autofill-page-details";
import AutofillScript from "../models/autofill-script";

export const FILL_RULE_FIELD_NAME = "keykeeper.fill";

/** How a rule recognizes a field on a page. The first present key that matches wins. */
export type FieldFingerprint = {
  id?: string;
  name?: string;
  label?: string;
};

export type FillSource =
  | { from: "username" }
  | { from: "password" }
  | { from: "totp" }
  | { from: "field"; name: string }
  | { from: "never" };

export type FillRule = {
  v: 1;
  field: FieldFingerprint;
  fill: FillSource;
};

const normalize = (text: string | null | undefined) =>
  (text ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/** The label people see next to the field, as the page describes it. */
function fieldLabel(field: AutofillField): string {
  return normalize(field["label-tag"] || field["label-aria"] || field.placeholder || "");
}

/** Builds a fingerprint for a field on a page, from its most stable attributes. */
export function fingerprintField(field: AutofillField): FieldFingerprint {
  const fingerprint: FieldFingerprint = {};
  if (field.htmlID) {
    fingerprint.id = field.htmlID;
  }
  if (field.htmlName) {
    fingerprint.name = field.htmlName;
  }
  const label = fieldLabel(field);
  if (label) {
    fingerprint.label = label;
  }
  return fingerprint;
}

/**
 * Whether a field on a page is the one a rule describes. The id decides when
 * the rule has one, then the name, then the visible label, so a rule survives
 * small page changes but never matches a different field just by label when
 * the id says otherwise.
 */
export function fieldMatches(fingerprint: FieldFingerprint, field: AutofillField): boolean {
  if (fingerprint.id && field.htmlID) {
    return fingerprint.id === field.htmlID;
  }
  if (fingerprint.name && field.htmlName) {
    return fingerprint.name === field.htmlName;
  }
  if (fingerprint.label) {
    return fingerprint.label === fieldLabel(field);
  }
  return false;
}

function isFillRule(value: unknown): value is FillRule {
  const rule = value as FillRule;
  if (rule?.v !== 1 || typeof rule.field !== "object" || typeof rule.fill !== "object") {
    return false;
  }
  const from = rule.fill.from;
  if (from === "field") {
    return typeof (rule.fill as { name?: unknown }).name === "string";
  }
  return from === "username" || from === "password" || from === "totp" || from === "never";
}

/** The fill rules stored on an item. Anything unreadable is ignored. */
export function readFillRules(cipher: CipherView): FillRule[] {
  const rules: FillRule[] = [];
  for (const field of cipher.fields ?? []) {
    if (field.name !== FILL_RULE_FIELD_NAME || !field.value) {
      continue;
    }
    try {
      const parsed = JSON.parse(field.value);
      if (isFillRule(parsed)) {
        rules.push(parsed);
      }
    } catch {
      // Not a rule we understand; leave it alone.
    }
  }
  return rules;
}

const sameField = (a: FieldFingerprint, b: FieldFingerprint) =>
  (a.id ?? null) === (b.id ?? null) &&
  (a.name ?? null) === (b.name ?? null) &&
  (a.label ?? null) === (b.label ?? null);

/**
 * Adds a rule to an item, replacing any existing rule for the same field.
 * The caller saves the item.
 */
export function upsertFillRule(cipher: CipherView, rule: FillRule): void {
  const others = (cipher.fields ?? []).filter((field) => {
    if (field.name !== FILL_RULE_FIELD_NAME) {
      return true;
    }
    try {
      const existing = JSON.parse(field.value ?? "");
      return !(isFillRule(existing) && sameField(existing.field, rule.field));
    } catch {
      return true;
    }
  });
  const ruleField = new FieldView();
  ruleField.name = FILL_RULE_FIELD_NAME;
  ruleField.type = FieldType.Hidden;
  ruleField.value = JSON.stringify(rule);
  cipher.fields = [...others, ruleField];
}

/** The custom fields a person sees on an item, without our rule fields. */
export function visibleCustomFields(cipher: CipherView): FieldView[] {
  return (cipher.fields ?? []).filter((field) => field.name !== FILL_RULE_FIELD_NAME);
}

/**
 * Applies an item's fill rules to a fill script, before upstream's own
 * matching runs. Value rules fill their field. Never rules claim their field
 * without filling it, so nothing later fills it either. Fields claimed here are
 * added to `filledFields`, which upstream's matching skips.
 */
export async function applyFillRules(
  cipher: CipherView,
  pageDetails: AutofillPageDetails,
  fillScript: AutofillScript,
  filledFields: { [opid: string]: AutofillField },
  valueFor: (source: FillSource) => Promise<string | null>,
  fill: (fillScript: AutofillScript, field: AutofillField, value: string) => void,
): Promise<void> {
  const rules = readFillRules(cipher);
  if (!rules.length) {
    return;
  }
  for (const field of pageDetails.fields) {
    if (field.opid == null || Object.prototype.hasOwnProperty.call(filledFields, field.opid)) {
      continue;
    }
    const rule = rules.find((r) => fieldMatches(r.field, field));
    if (!rule) {
      continue;
    }
    if (rule.fill.from === "never") {
      filledFields[field.opid] = field;
      continue;
    }
    const value = await valueFor(rule.fill);
    if (value == null || value === "") {
      continue;
    }
    filledFields[field.opid] = field;
    fill(fillScript, field, value);
  }
}

/** The plain value for a source on an item, without the TOTP code (async elsewhere). */
export function staticValueFor(cipher: CipherView, source: FillSource): string | null {
  switch (source.from) {
    case "username":
      return cipher.login?.username ?? null;
    case "password":
      return cipher.login?.password ?? null;
    case "field":
      return visibleCustomFields(cipher).find((f) => f.name === source.name)?.value ?? null;
    default:
      return null;
  }
}
