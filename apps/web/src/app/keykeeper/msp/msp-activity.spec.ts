import { describeEvent, MspEvent } from "./msp-activity";

const event = (fields: Partial<MspEvent>): MspEvent => ({
  id: "1",
  date: "2026-10-16T09:30:00.000Z",
  event: "",
  actorEmail: "ana@northwind.test",
  organizationId: "org-1",
  organizationName: "Acme Dental",
  targetEmail: "ben@northwind.test",
  detail: null,
  ip: "127.0.0.1",
  ...fields,
});

describe("MSP activity sentences", () => {
  it.each([
    [{ event: "msp_created", detail: "Northwind IT" }, "ana@northwind.test set up Northwind IT"],
    [
      { event: "client_created", detail: "Business defaults" },
      "ana@northwind.test added the client Acme Dental with Business defaults",
    ],
    [
      { event: "client_created", detail: "No defaults" },
      "ana@northwind.test added the client Acme Dental",
    ],
    [
      { event: "staff_added", detail: "technician" },
      "ana@northwind.test added ben@northwind.test as a technician",
    ],
    [
      { event: "staff_role_changed", detail: "admin" },
      "ana@northwind.test made ben@northwind.test an admin",
    ],
    [
      { event: "staff_removed" },
      "ana@northwind.test removed ben@northwind.test from the MSP and every client",
    ],
    [
      { event: "install_token_replaced" },
      "ana@northwind.test replaced the install token for Acme Dental",
    ],
    [
      { event: "joined_with_install_command", actorEmail: "ben@northwind.test" },
      "ben@northwind.test joined Acme Dental with the install command",
    ],
    [
      { event: "member_confirmed" },
      "ana@northwind.test confirmed ben@northwind.test in Acme Dental",
    ],
    [
      { event: "client_removed_msp", actorEmail: "owner@acme.test" },
      "Acme Dental removed this MSP (owner@acme.test)",
    ],
    [
      { event: "staff_invited", detail: "admin" },
      "ana@northwind.test invited ben@northwind.test to join as an admin",
    ],
    [{ event: "something_new" }, "something_new by ana@northwind.test"],
  ])("%j reads as %s", (fields, sentence) => {
    expect(describeEvent(event(fields))).toBe(sentence);
  });

  it("still reads when names are gone", () => {
    expect(
      describeEvent(
        event({
          event: "member_confirmed",
          actorEmail: null,
          organizationName: null,
          targetEmail: null,
        }),
      ),
    ).toBe("Someone confirmed someone in a client");
  });
});
