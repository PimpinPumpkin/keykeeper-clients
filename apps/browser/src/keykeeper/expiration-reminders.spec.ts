import { reminderLevel, shouldRemind } from "./expiration-reminders";

describe("Keykeeper expiration reminders", () => {
  it.each([
    [45, null],
    [31, null],
    [30, "30"],
    [8, "30"],
    [7, "7"],
    [2, "7"],
    [1, "1"],
    [0, "1"],
    [-1, "expired"],
  ])("%i days away is reminder step %s", (days, level) => {
    expect(reminderLevel({ state: days < 0 ? "expired" : "soon", days })).toBe(level);
  });

  it("reminds once per step, and again when the item reaches a more urgent one", () => {
    expect(shouldRemind(undefined, "2026-11-01", "30")).toBe(true);
    expect(shouldRemind({ date: "2026-11-01", level: "30" }, "2026-11-01", "30")).toBe(false);
    expect(shouldRemind({ date: "2026-11-01", level: "30" }, "2026-11-01", "7")).toBe(true);
    expect(shouldRemind({ date: "2026-11-01", level: "expired" }, "2026-11-01", "1")).toBe(false);
  });

  it("starts over when the expiry date changes", () => {
    expect(shouldRemind({ date: "2026-11-01", level: "expired" }, "2027-11-01", "30")).toBe(true);
  });
});
