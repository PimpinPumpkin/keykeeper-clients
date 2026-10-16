import { MspPolicies } from "./msp-api.service";
import {
  clientList,
  clientPolicySummary,
  defaultPolicyRows,
  describePolicyResult,
} from "./msp-policies";

const TWO_STEP = 0;
const MASTER_PASSWORD = 1;
const SINGLE_ORG = 3;
const DISABLE_SEND = 6;

const policies: MspPolicies = {
  types: [TWO_STEP, MASTER_PASSWORD, SINGLE_ORG, DISABLE_SEND],
  defaults: [
    { type: TWO_STEP, enabled: false, data: null },
    { type: MASTER_PASSWORD, enabled: true, data: { minLength: 12 } },
    { type: SINGLE_ORG, enabled: true, data: null },
  ],
  clients: [
    { id: "dental", name: "Acme Dental", own: [] },
    {
      id: "law",
      name: "Baker Law",
      own: [
        { type: MASTER_PASSWORD, enabled: true, data: { minLength: 14 } },
        { type: DISABLE_SEND, enabled: true, data: null },
      ],
    },
  ],
};

describe("MSP default policies", () => {
  it("lists the shown policies in order, with clients that have their own setting", () => {
    const rows = defaultPolicyRows(policies, [MASTER_PASSWORD, TWO_STEP, DISABLE_SEND, 99]);
    expect(rows.map((r) => r.type)).toEqual([MASTER_PASSWORD, TWO_STEP, DISABLE_SEND]);
    expect(rows[0].default).toEqual({
      type: MASTER_PASSWORD,
      enabled: true,
      data: { minLength: 12 },
    });
    expect(rows[0].own).toEqual([{ id: "law", name: "Baker Law" }]);
    expect(rows[1].own).toEqual([]);
    // A policy without a stored default is off.
    expect(rows[2].default).toEqual({ type: DISABLE_SEND, enabled: false, data: null });
  });

  it("sums up each client's policies, counting only the policies shown", () => {
    const shown = [TWO_STEP, MASTER_PASSWORD, SINGLE_ORG, DISABLE_SEND];
    expect(clientPolicySummary(policies, "dental", shown)).toBe("Defaults");
    expect(clientPolicySummary(policies, "law", shown)).toBe("2 own settings");
    expect(clientPolicySummary(policies, "law", [MASTER_PASSWORD])).toBe("1 own setting");
    expect(clientPolicySummary(policies, "unknown", shown)).toBe("");
    expect(clientPolicySummary(null, "law", shown)).toBe("");
  });

  it("names clients in a sentence", () => {
    const c = (name: string) => ({ id: name, name });
    expect(clientList([c("A")])).toBe("A");
    expect(clientList([c("A"), c("B")])).toBe("A and B");
    expect(clientList([c("A"), c("B"), c("C")])).toBe("A, B, and C");
    expect(clientList([c("A"), c("B"), c("C"), c("D")])).toBe("4 clients");
  });

  it("says what a change did", () => {
    const c = (name: string) => ({ id: name, name });
    expect(
      describePolicyResult({
        changed: [c("Acme Dental"), c("Corner Bakery")],
        kept: [c("Baker Law")],
        refused: [],
      }),
    ).toBe("Changed in Acme Dental and Corner Bakery. Baker Law kept its own setting.");
    expect(describePolicyResult({ changed: [], kept: [c("A"), c("B")], refused: [] })).toBe(
      "No client needed a change. A and B kept their own setting.",
    );
    expect(
      describePolicyResult({
        changed: [c("A")],
        refused: [{ ...c("B"), error: "Single organization is off" }],
      }),
    ).toBe("Changed in A. B refused it: Single organization is off");
  });
});
