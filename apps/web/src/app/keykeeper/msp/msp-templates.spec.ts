import { MspTemplates } from "./msp-api.service";
import { KnownItem, templateRows, templateStatus, templateTargets } from "./msp-templates";

const clients = [
  { id: "dental", name: "Acme Dental" },
  { id: "law", name: "Baker Law" },
  { id: "bakery", name: "Corner Bakery" },
];

const item = (
  name: string,
  revision: string,
  organizationId: string | null,
  deleted = false,
): KnownItem => ({ name, revision, organizationId, deleted });

const state: MspTemplates = {
  templates: [
    {
      templateId: "fw",
      sourceCipherId: "source-fw",
      allClients: true,
      clients: [],
      createdAt: "",
    },
    {
      templateId: "m365",
      sourceCipherId: "source-m365",
      allClients: false,
      clients: ["law"],
      createdAt: "",
    },
  ],
  copies: [
    { organizationId: "dental", templateId: "fw", cipherId: "copy-1", sourceRevision: "v2" },
    { organizationId: "law", templateId: "fw", cipherId: "copy-2", sourceRevision: "v1" },
    { organizationId: "bakery", templateId: "fw", cipherId: "copy-3", sourceRevision: "v2" },
    { organizationId: "law", templateId: "m365", cipherId: "copy-4", sourceRevision: "v1" },
  ],
  collections: {},
};

describe("MSP templates", () => {
  it("are up to date where the copy was made from the source's current version", () => {
    const items = new Map([
      ["source-fw", item("Firewall", "v2", null)],
      ["copy-1", item("Firewall", "v2", "dental")],
      ["copy-2", item("Firewall", "v1", "law")],
      // Corner Bakery deleted its copy.
      ["copy-3", item("Firewall", "v2", "bakery", true)],
    ]);
    const [fw] = templateRows(state, clients, items);

    expect(fw).toMatchObject({ name: "Firewall", sourceVisible: true, allClients: true });
    expect(fw.upToDate.map((c) => c.name)).toEqual(["Acme Dental"]);
    expect(fw.behind.map((c) => c.name)).toEqual(["Baker Law", "Corner Bakery"]);
    expect(templateStatus(fw)).toBe("2 of 3 clients need it");
    expect(templateTargets(fw)).toBe("Every client");
  });

  it("go only to chosen clients, and without the source can only tell which clients have a copy", () => {
    const items = new Map([["copy-4", item("Microsoft 365", "v9", "law")]]);
    const m365 = templateRows(state, clients, items)[1];

    expect(m365).toMatchObject({ name: "Microsoft 365", sourceVisible: false });
    expect(m365.targets.map((c) => c.name)).toEqual(["Baker Law"]);
    expect(m365.upToDate.map((c) => c.name)).toEqual(["Baker Law"]);
    expect(templateStatus(m365)).toBe("Up to date");
    expect(templateTargets(m365)).toBe("Baker Law");
  });

  it("count a copy only in the client it belongs to", () => {
    const items = new Map([
      ["source-fw", item("Firewall", "v2", null)],
      ["copy-1", item("Firewall", "v2", "law")],
    ]);
    const [fw] = templateRows(state, [clients[0]], items);
    expect(fw.behind.map((c) => c.name)).toEqual(["Acme Dental"]);
    expect(templateStatus(fw)).toBe("1 of 1 client needs it");
  });

  it("have no name when the person sees neither the source nor a copy", () => {
    const [fw] = templateRows(state, clients, new Map());
    expect(fw.name).toBeNull();
    expect(
      templateTargets({ allClients: false, targets: [...clients, { id: "x", name: "X" }] }),
    ).toBe("4 clients");
    expect(templateStatus({ ...fw, targets: [] })).toBe("No clients yet");
  });
});
