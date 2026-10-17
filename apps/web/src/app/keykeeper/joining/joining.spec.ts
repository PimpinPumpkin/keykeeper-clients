import { describeJoining, inviteChoices, lifetime } from "./joining";

describe("Joining wording", () => {
  it("says lifetimes the way the invitation email does", () => {
    expect(lifetime(1)).toBe("1 hour");
    expect(lifetime(2)).toBe("2 hours");
    expect(lifetime(24)).toBe("1 day");
    expect(lifetime(120)).toBe("5 days");
    expect(lifetime(36)).toBe("36 hours");
  });

  it("offers 2 hours, 1 day, and 5 days, and keeps a setting made elsewhere", () => {
    expect(inviteChoices(24).map((c) => c.label)).toEqual(["2 hours", "1 day", "5 days"]);
    expect(inviteChoices(72).map((c) => c.label)).toEqual(["2 hours", "1 day", "3 days", "5 days"]);
  });

  it("describes a setting in one line", () => {
    expect(describeJoining({ autoConfirm: true, inviteHours: 2 })).toBe(
      "Let in automatically; invitations last 2 hours",
    );
    expect(describeJoining({ autoConfirm: false, inviteHours: 120 })).toBe(
      "An admin approves each one; invitations last 5 days",
    );
  });
});
