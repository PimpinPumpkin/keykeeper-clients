import { mock } from "jest-mock-extended";
import { BehaviorSubject, of, throwError } from "rxjs";

import { OrganizationService } from "@bitwarden/common/admin-console/abstractions/organization/organization.service.abstraction";
import { Organization } from "@bitwarden/common/admin-console/models/domain/organization";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { AuthService } from "@bitwarden/common/auth/abstractions/auth.service";
import { AuthenticationStatus } from "@bitwarden/common/auth/enums/authentication-status";
import { SyncService } from "@bitwarden/common/platform/sync";
import { UserId } from "@bitwarden/common/types/guid";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { newTemplateDefinitionField } from "@bitwarden/common/vault/keykeeper/templates";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";

import { OrganizationUserService } from "../organization-user";

import { KeykeeperMspRequests } from "./msp-requests";
import { KeykeeperTemplateSender } from "./msp-template-sender";
import { MspTemplates, PendingMember } from "./msp-types";
import { duplicateCopies, KeykeeperMspWork } from "./msp-work";

const USER = "user-1" as UserId;

function setup() {
  const requests = mock<KeykeeperMspRequests>();
  const sender = mock<KeykeeperTemplateSender>();
  const accountService = mock<AccountService>();
  accountService.activeAccount$ = new BehaviorSubject({ id: USER } as any);
  const authService = mock<AuthService>();
  authService.getAuthStatus.mockResolvedValue(AuthenticationStatus.Unlocked);
  const cipherService = mock<CipherService>();
  cipherService.getAllDecrypted.mockResolvedValue([]);
  const organizationService = mock<OrganizationService>();
  const dental = { id: "dental", name: "Acme Dental" } as Organization;
  organizationService.organizations$.mockReturnValue(of([dental]));
  const organizationUserService = mock<OrganizationUserService>();
  organizationUserService.confirmUser.mockReturnValue(of(undefined));
  const syncService = mock<SyncService>();
  const work = new KeykeeperMspWork(
    requests,
    sender,
    accountService,
    authService,
    cipherService,
    organizationService,
    organizationUserService,
    syncService,
  );
  return { work, requests, authService, organizationUserService };
}

const member = (organizationId: string, memberId: string): PendingMember => ({
  organizationId,
  memberId,
  email: `${memberId}@example.test`,
  publicKey: "AAEC",
});

describe("MSP background work", () => {
  it("confirms members waiting in clients the person has the key for, and reports the ones it couldn't", async () => {
    const { work, requests, organizationUserService } = setup();
    requests.pending.mockResolvedValue([
      member("dental", "ana"),
      member("dental", "ben"),
      member("unknown-org", "cy"),
    ]);
    organizationUserService.confirmUser.mockImplementation((_org, memberId) =>
      memberId === "ben" ? throwError(() => new Error("Already confirmed")) : of(undefined),
    );
    const updated = jest.fn();
    work.updated$.subscribe(updated);

    const result = await work.confirmPending("msp-1");

    expect(result).toEqual({
      confirmed: 1,
      failed: ["ben@example.test in Acme Dental: Already confirmed"],
    });
    expect(organizationUserService.confirmUser).toHaveBeenCalledTimes(2);
    expect(updated).toHaveBeenCalledTimes(1);
  });

  it("does nothing while the vault is locked", async () => {
    const { work, requests, authService } = setup();
    authService.getAuthStatus.mockResolvedValue(AuthenticationStatus.Locked);
    expect(await work.run()).toEqual([]);
    expect(requests.list).not.toHaveBeenCalled();
  });

  it("runs one at a time, and once more when asked during a run", async () => {
    const { work, requests } = setup();
    let release!: () => void;
    requests.list.mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve([]))),
    );
    requests.list.mockResolvedValue([]);

    const first = work.run();
    const second = work.run();
    await Promise.resolve();
    expect(requests.list).toHaveBeenCalledTimes(1);
    release();
    await first;
    await second;
    // The request made during the first run starts a second one.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requests.list).toHaveBeenCalledTimes(2);
  });

  it("confirms for technicians too, but only MSP admins write templates", async () => {
    const { work, requests } = setup();
    requests.list.mockResolvedValue([{ id: "msp-1", name: "Northwind IT", role: "technician" }]);
    requests.pending.mockResolvedValue([]);
    await work.run();
    expect(requests.pending).toHaveBeenCalledWith("msp-1");
    expect(requests.getTemplates).not.toHaveBeenCalled();
  });
});

describe("Duplicate template copies", () => {
  const item = (id: string, organizationId: string | null, templateId: string, from?: string) => {
    const view = new CipherView();
    view.id = id;
    view.organizationId = organizationId as any;
    view.fields = [newTemplateDefinitionField("note", templateId, from)];
    return view;
  };
  const state: MspTemplates = {
    templates: [],
    copies: [
      { organizationId: "dental", templateId: "fw", cipherId: "kept", sourceRevision: "v1" },
    ],
    collections: {},
  };

  it("are the MSP's copies in a client other than the recorded one", () => {
    const deleted = item("old", "dental", "fw", "Northwind IT");
    deleted.deletedDate = new Date();
    expect(
      duplicateCopies(state, [
        item("kept", "dental", "fw", "Northwind IT"),
        item("extra", "dental", "fw", "Northwind IT"),
        deleted,
        // Another client's copy, the client's own template, and the source.
        item("law-copy", "law", "fw", "Northwind IT"),
        item("own", "dental", "fw"),
        item("source", null, "fw"),
      ]),
    ).toEqual(["extra"]);
  });

  it("are left alone when the recorded copy is gone", () => {
    expect(duplicateCopies(state, [item("extra", "dental", "fw", "Northwind IT")])).toEqual([]);
  });
});
