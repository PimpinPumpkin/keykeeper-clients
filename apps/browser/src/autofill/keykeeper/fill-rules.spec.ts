import { CipherType, FieldType } from "@bitwarden/common/vault/enums";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { FieldView } from "@bitwarden/common/vault/models/view/field.view";
import { LoginView } from "@bitwarden/common/vault/models/view/login.view";

import AutofillField from "../models/autofill-field";
import AutofillPageDetails from "../models/autofill-page-details";
import AutofillScript from "../models/autofill-script";

import {
  applyFillRules,
  fieldMatches,
  FillRule,
  FILL_RULE_FIELD_NAME,
  FillSource,
  fingerprintField,
  readFillRules,
  staticValueFor,
  upsertFillRule,
  visibleCustomFields,
} from "./fill-rules";

function pageField(overrides: Partial<AutofillField>): AutofillField {
  return {
    opid: "__0",
    elementNumber: 0,
    viewable: true,
    htmlID: null,
    htmlName: null,
    htmlClass: null,
    tabindex: null,
    title: null,
    ...overrides,
  } as AutofillField;
}

function customField(name: string, value: string, type: FieldType = FieldType.Text) {
  const field = new FieldView();
  field.name = name;
  field.value = value;
  field.type = type;
  return field;
}

function loginItem(fields: FieldView[] = []): CipherView {
  const cipher = new CipherView();
  cipher.type = CipherType.Login;
  cipher.login = new LoginView();
  cipher.login.username = "alice";
  cipher.login.password = "correct-password";
  cipher.fields = fields;
  return cipher;
}

const rule = (field: FillRule["field"], fill: FillSource): FillRule => ({ v: 1, field, fill });

function fill(fillScript: AutofillScript, field: AutofillField, value: string) {
  fillScript.script.push(["fill_by_opid", field.opid, value]);
}

describe("Keykeeper fill rules", () => {
  describe("fingerprintField", () => {
    it("uses the id, the name, and the visible label, normalized", () => {
      const field = pageField({
        htmlID: "custno",
        htmlName: "customer",
        "label-tag": "  Customer\n number ",
      });

      expect(fingerprintField(field)).toEqual({
        id: "custno",
        name: "customer",
        label: "customer number",
      });
    });

    it("falls back to the aria label and then the placeholder", () => {
      expect(fingerprintField(pageField({ "label-aria": "PIN" }))).toEqual({ label: "pin" });
      expect(fingerprintField(pageField({ placeholder: "Member ID" }))).toEqual({
        label: "member id",
      });
    });
  });

  describe("fieldMatches", () => {
    it("lets the id decide when both sides have one", () => {
      const fingerprint = { id: "custno", label: "customer number" };

      expect(fieldMatches(fingerprint, pageField({ htmlID: "custno" }))).toBe(true);
      expect(
        fieldMatches(fingerprint, pageField({ htmlID: "other", "label-tag": "Customer number" })),
      ).toBe(false);
    });

    it("uses the name when there is no id, then the label", () => {
      expect(fieldMatches({ name: "pin" }, pageField({ htmlName: "pin" }))).toBe(true);
      expect(fieldMatches({ name: "pin" }, pageField({ htmlName: "otp" }))).toBe(false);
      expect(fieldMatches({ label: "member id" }, pageField({ "label-tag": "Member ID" }))).toBe(
        true,
      );
    });

    it("never matches on an empty fingerprint", () => {
      expect(fieldMatches({}, pageField({ htmlID: "x" }))).toBe(false);
    });
  });

  describe("reading and writing rules", () => {
    it("reads only valid rules and ignores everything else", () => {
      const cipher = loginItem([
        customField("Customer ID", "C-12345"),
        customField(
          FILL_RULE_FIELD_NAME,
          JSON.stringify(rule({ id: "custno" }, { from: "field", name: "Customer ID" })),
          FieldType.Hidden,
        ),
        customField(FILL_RULE_FIELD_NAME, "not json", FieldType.Hidden),
        customField(
          FILL_RULE_FIELD_NAME,
          JSON.stringify({ v: 2, field: {}, fill: { from: "never" } }),
          FieldType.Hidden,
        ),
        customField(
          FILL_RULE_FIELD_NAME,
          JSON.stringify({ v: 1, field: {}, fill: { from: "everything" } }),
          FieldType.Hidden,
        ),
      ]);

      expect(readFillRules(cipher)).toEqual([
        rule({ id: "custno" }, { from: "field", name: "Customer ID" }),
      ]);
    });

    it("stores a rule as a hidden field and replaces an older rule for the same field", () => {
      const cipher = loginItem([customField("Customer ID", "C-12345")]);

      upsertFillRule(cipher, rule({ id: "pin" }, { from: "password" }));
      upsertFillRule(cipher, rule({ id: "custno" }, { from: "field", name: "Customer ID" }));
      upsertFillRule(cipher, rule({ id: "pin" }, { from: "never" }));

      expect(readFillRules(cipher)).toEqual([
        rule({ id: "custno" }, { from: "field", name: "Customer ID" }),
        rule({ id: "pin" }, { from: "never" }),
      ]);
      expect(
        cipher.fields
          .filter((f) => f.name === FILL_RULE_FIELD_NAME)
          .every((f) => f.type === FieldType.Hidden),
      ).toBe(true);
      expect(visibleCustomFields(cipher).map((f) => f.name)).toEqual(["Customer ID"]);
    });
  });

  describe("applyFillRules", () => {
    const valueFor = (cipher: CipherView) => async (source: FillSource) =>
      source.from === "totp" ? "123456" : staticValueFor(cipher, source);

    it("fills a field from a custom field and claims it", async () => {
      const cipher = loginItem([customField("Customer ID", "C-12345")]);
      upsertFillRule(cipher, rule({ id: "custno" }, { from: "field", name: "Customer ID" }));
      const pageDetails = {
        fields: [pageField({ opid: "__1", htmlID: "custno" })],
      } as AutofillPageDetails;
      const fillScript = new AutofillScript();
      const filledFields: { [opid: string]: AutofillField } = {};

      await applyFillRules(cipher, pageDetails, fillScript, filledFields, valueFor(cipher), fill);

      expect(fillScript.script).toEqual([["fill_by_opid", "__1", "C-12345"]]);
      expect(Object.keys(filledFields)).toEqual(["__1"]);
    });

    it("claims a never-fill field without filling it, so nothing else fills it", async () => {
      const cipher = loginItem();
      upsertFillRule(cipher, rule({ id: "pin" }, { from: "never" }));
      const pageDetails = {
        fields: [pageField({ opid: "__2", htmlID: "pin", type: "password" })],
      } as AutofillPageDetails;
      const fillScript = new AutofillScript();
      const filledFields: { [opid: string]: AutofillField } = {};

      const neverFill = await applyFillRules(
        cipher,
        pageDetails,
        fillScript,
        filledFields,
        valueFor(cipher),
        fill,
      );

      expect(fillScript.script).toEqual([]);
      expect(Object.keys(filledFields)).toEqual(["__2"]);
      expect([...neverFill]).toEqual(["__2"]);
    });

    it("fills the verification code when the rule asks for it", async () => {
      const cipher = loginItem();
      upsertFillRule(cipher, rule({ name: "otp" }, { from: "totp" }));
      const pageDetails = {
        fields: [pageField({ opid: "__3", htmlName: "otp" })],
      } as AutofillPageDetails;
      const fillScript = new AutofillScript();

      await applyFillRules(cipher, pageDetails, fillScript, {}, valueFor(cipher), fill);

      expect(fillScript.script).toEqual([["fill_by_opid", "__3", "123456"]]);
    });

    it("skips fields that are already filled and rules whose value is gone", async () => {
      const cipher = loginItem();
      upsertFillRule(cipher, rule({ id: "a" }, { from: "password" }));
      upsertFillRule(cipher, rule({ id: "b" }, { from: "field", name: "Deleted field" }));
      const pageDetails = {
        fields: [pageField({ opid: "__4", htmlID: "a" }), pageField({ opid: "__5", htmlID: "b" })],
      } as AutofillPageDetails;
      const fillScript = new AutofillScript();
      const already = pageDetails.fields[0];

      await applyFillRules(
        cipher,
        pageDetails,
        fillScript,
        { __4: already },
        valueFor(cipher),
        fill,
      );

      expect(fillScript.script).toEqual([]);
    });

    it("does nothing for an item without rules", async () => {
      const cipher = loginItem([customField("Customer ID", "C-12345")]);
      const fillScript = new AutofillScript();
      const valueForSpy = jest.fn();

      await applyFillRules(
        cipher,
        { fields: [pageField({})] } as AutofillPageDetails,
        fillScript,
        {},
        valueForSpy,
        fill,
      );

      expect(valueForSpy).not.toHaveBeenCalled();
      expect(fillScript.script).toEqual([]);
    });
  });
});
