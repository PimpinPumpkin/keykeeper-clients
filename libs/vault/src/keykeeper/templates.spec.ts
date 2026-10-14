import { CipherType, FieldType } from "@bitwarden/common/vault/enums";

import {
  BUILT_IN_TEMPLATES,
  TEMPLATE_FIELD_NAME,
  templateCipherType,
  templateFields,
  templateOf,
} from "./templates";

const apiKey = BUILT_IN_TEMPLATES.find((t) => t.id === "api-key")!;
const domain = BUILT_IN_TEMPLATES.find((t) => t.id === "domain")!;

describe("Keykeeper item templates", () => {
  it("have unique ids and names, and at least one field each", () => {
    expect(new Set(BUILT_IN_TEMPLATES.map((t) => t.id)).size).toBe(BUILT_IN_TEMPLATES.length);
    expect(new Set(BUILT_IN_TEMPLATES.map((t) => t.name)).size).toBe(BUILT_IN_TEMPLATES.length);
    expect(BUILT_IN_TEMPLATES.every((t) => t.fields.length > 0)).toBe(true);
  });

  it("build on a login or a note", () => {
    expect(templateCipherType(apiKey)).toBe(CipherType.SecureNote);
    expect(templateCipherType(BUILT_IN_TEMPLATES.find((t) => t.id === "server")!)).toBe(
      CipherType.Login,
    );
  });

  it("start a new item with empty typed fields and a marker", () => {
    const fields = templateFields(apiKey);

    expect(fields.map((f) => [f.name, f.type, f.value])).toEqual([
      ["Key", FieldType.Hidden, ""],
      ["Secret", FieldType.Hidden, ""],
      ["Service URL", FieldType.Text, ""],
      ["Scopes", FieldType.Text, ""],
      [TEMPLATE_FIELD_NAME, FieldType.Text, '{"id":"api-key","v":1}'],
    ]);
    expect(templateFields(domain).find((f) => f.name === "Auto-renew")).toMatchObject({
      type: FieldType.Boolean,
      value: "false",
    });
  });

  it("can tell which template an item came from", () => {
    expect(templateOf({ fields: templateFields(apiKey) })).toBe(apiKey);
    expect(templateOf({ fields: [] })).toBeNull();
    expect(templateOf({ fields: [{ name: TEMPLATE_FIELD_NAME, value: "not json" }] })).toBeNull();
    expect(
      templateOf({ fields: [{ name: TEMPLATE_FIELD_NAME, value: '{"id":"gone"}' }] }),
    ).toBeNull();
  });
});
