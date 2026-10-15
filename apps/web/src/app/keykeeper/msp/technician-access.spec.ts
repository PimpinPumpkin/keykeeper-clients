import { describeAccess, DEFAULT_ACCESS, NO_PERMISSIONS } from "./technician-access";

const clients = [
  { id: "acme", name: "Acme Dental" },
  { id: "baker", name: "Baker Law" },
];

describe("technician access in words", () => {
  it("reads the default as every client, admin, with install commands", () => {
    expect(describeAccess(DEFAULT_ACCESS, clients)).toBe("Every client · Admin · Install commands");
  });

  it("names chosen clients in order, and a custom role with or without vault items", () => {
    const custom = {
      allClients: false,
      clients: ["baker", "acme"],
      custom: { permissions: { ...NO_PERMISSIONS, manageUsers: true }, vaultItems: false },
      installCommands: false,
    };
    expect(describeAccess(custom, clients)).toBe(
      "Acme Dental, Baker Law · Custom role · No install commands",
    );
    expect(
      describeAccess({ ...custom, custom: { ...custom.custom, vaultItems: true } }, clients),
    ).toBe("Acme Dental, Baker Law · Custom role with vault items · No install commands");
  });

  it("says when no client is chosen, and skips clients that are gone", () => {
    const access = { ...DEFAULT_ACCESS, allClients: false, clients: ["gone"] };
    expect(describeAccess(access, clients)).toBe("No clients · Admin · Install commands");
  });
});
