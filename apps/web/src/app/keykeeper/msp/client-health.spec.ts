import { CipherType, FieldType } from "@bitwarden/common/vault/enums";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { FieldView } from "@bitwarden/common/vault/models/view/field.view";
import { LoginView } from "@bitwarden/common/vault/models/view/login.view";

import { clientHealth, StrengthScorer, usernameHints } from "./client-health";

const today = new Date(2026, 9, 15);

function login(org: string, password: string | null, username = "alex@acme.test"): CipherView {
  const cipher = new CipherView();
  cipher.type = CipherType.Login;
  cipher.organizationId = org;
  cipher.login = new LoginView();
  cipher.login.password = password;
  cipher.login.username = username;
  return cipher;
}

function expiringNote(org: string, date: string): CipherView {
  const cipher = new CipherView();
  cipher.type = CipherType.SecureNote;
  cipher.organizationId = org;
  const field = new FieldView();
  field.name = "keykeeper.expires";
  field.type = FieldType.Text;
  field.value = date;
  cipher.fields = [field];
  return cipher;
}

// Scores by length, so tests don't depend on the strength library.
const byLength: StrengthScorer = (password) => (password.length >= 12 ? 4 : 1);

describe("MSP client health", () => {
  it("counts items, weak and reused passwords, and expiring items per client", () => {
    const ciphers = [
      login("acme", "short1"),
      login("acme", "a-long-shared-passphrase"),
      login("acme", "a-long-shared-passphrase"),
      login("acme", "another-long-unique-one"),
      expiringNote("acme", "2026-10-20"),
      expiringNote("acme", "2027-03-01"),
      login("baker", "short1"),
    ];

    const health = clientHealth(ciphers, ["acme", "baker", "empty"], byLength, today);

    expect(health.get("acme")).toEqual({ items: 6, expiring: 1, weak: 1, reused: 2 });
    // The same password in another client isn't reuse within a client.
    expect(health.get("baker")).toEqual({ items: 1, expiring: 0, weak: 1, reused: 0 });
    expect(health.get("empty")).toEqual({ items: 0, expiring: 0, weak: 0, reused: 0 });
  });

  it("leaves out trashed items, personal items, other organizations, and logins without passwords", () => {
    const trashed = login("acme", "short1");
    trashed.deletedDate = new Date(2026, 9, 1);
    const ciphers = [
      trashed,
      login(null as unknown as string, "short1"),
      login("other", "short1"),
      login("acme", null),
    ];

    expect(clientHealth(ciphers, ["acme"], byLength, today).get("acme")).toEqual({
      items: 1,
      expiring: 0,
      weak: 0,
      reused: 0,
    });
  });

  it("gives the scorer the username's parts as hints, as upstream's weak passwords report does", () => {
    const seen: (string[] | null)[] = [];
    const recording: StrengthScorer = (_password, hints) => {
      seen.push(hints);
      return 4;
    };

    clientHealth(
      [login("acme", "x", "jane.doe@acme.test"), login("acme", "y", "ab")],
      ["acme"],
      recording,
      today,
    );

    expect(seen).toEqual([["jane", "doe"], null]);
    expect(usernameHints("Front.Desk-01")).toEqual(["front", "desk"]);
  });
});
