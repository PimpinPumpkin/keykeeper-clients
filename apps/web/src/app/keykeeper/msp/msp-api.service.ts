// Keykeeper: the MSP API (/api/keykeeper/msp on the server). Creating a client
// organization makes its keys in the browser the same way upstream's "New
// organization" does, and confirming members uses upstream's confirm request,
// so the server never sees a key it could decrypt with.

import { Injectable } from "@angular/core";
import { firstValueFrom } from "rxjs";

import { OrganizationUserService } from "@bitwarden/admin-console/common";
import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { OrganizationService } from "@bitwarden/common/admin-console/abstractions/organization/organization.service.abstraction";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { getUserId } from "@bitwarden/common/auth/services/account.service";
import { EncryptService } from "@bitwarden/common/key-management/crypto/abstractions/encrypt.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { Utils } from "@bitwarden/common/platform/misc/utils";
import { SyncService } from "@bitwarden/common/platform/sync";
import { OrgKey } from "@bitwarden/common/types/key";
import { KeyService } from "@bitwarden/key-management";

import { MspEvent } from "./msp-activity";

export type MspRole = "admin" | "technician";

/** The defaults a new client starts with. "business" is the Business preset. */
export type ClientPreset = "business" | "none";

export type MspSummary = { id: string; name: string; role: MspRole };

export type MspClient = {
  id: string;
  name: string;
  createdAt: string;
  preset: "business" | null;
  members: { confirmed: number; accepted: number; invited: number; revoked: number };
  /** The caller's own membership there, if any. Status 2 is confirmed. */
  you: { memberId: string; status: number; type: number } | null;
};

export type MspStaffMember = { userId: string; email: string; name: string | null; role: MspRole };

export type MspInvite = { id: string; email: string; role: MspRole; createdAt: string };

export type MspDetails = MspSummary & {
  staff: MspStaffMember[];
  invites: MspInvite[];
  clients: MspClient[];
};

/** Adding staff: added at once, or invited when they don't have an account yet. */
export type AddStaffResult =
  | { invited: false; email: string; role: MspRole }
  | {
      invited: true;
      inviteId: string;
      email: string;
      role: MspRole;
      inviteUrl: string;
      emailed: boolean;
    };

export type InvitationInfo = {
  mspName: string;
  role: MspRole;
  email: string;
  invitedBy: string;
  forYou: boolean;
};

export type ClientEnrollment = { token: string | null; createdAt: string | null; joins: number };

export type ClientMsp = {
  msp: { id: string; name: string } | null;
  staff: { memberId: string; email: string; name: string | null }[];
};

type Pending = { organizationId: string; memberId: string; email: string; publicKey: string };

@Injectable({ providedIn: "root" })
export class KeykeeperMspApiService {
  constructor(
    private readonly apiService: ApiService,
    private readonly accountService: AccountService,
    private readonly keyService: KeyService,
    private readonly encryptService: EncryptService,
    private readonly i18nService: I18nService,
    private readonly organizationService: OrganizationService,
    private readonly organizationUserService: OrganizationUserService,
    private readonly syncService: SyncService,
  ) {}

  async list(): Promise<MspSummary[]> {
    return (await this.apiService.send("GET", "/keykeeper/msp", null, true, true)).data;
  }

  async get(mspId: string): Promise<MspDetails> {
    return this.apiService.send("GET", `/keykeeper/msp/${mspId}`, null, true, true);
  }

  async create(name: string): Promise<MspSummary> {
    return this.apiService.send("POST", "/keykeeper/msp", { name }, true, true);
  }

  /**
   * Creates a client organization, with its keys made here, like upstream's
   * new organization. The Business preset also gets "Everyone" and "Admins"
   * collections; the server turns on its policies.
   */
  async createClient(mspId: string, name: string, preset: ClientPreset): Promise<void> {
    const userId = await firstValueFrom(this.accountService.activeAccount$.pipe(getUserId));
    const [encryptedKey, key] = await this.keyService.makeOrgKey<OrgKey>(userId);
    const [publicKey, encryptedPrivateKey] = await this.keyService.makeKeyPair(key);
    const business = preset === "business";
    const collectionName = await this.encryptService.encryptString(
      business ? "Everyone" : this.i18nService.t("defaultCollection"),
      key,
    );
    const adminsCollectionName = business
      ? (await this.encryptService.encryptString("Admins", key)).encryptedString
      : undefined;
    await this.apiService.send(
      "POST",
      `/keykeeper/msp/${mspId}/clients`,
      {
        name,
        preset,
        collectionName: collectionName.encryptedString,
        adminsCollectionName,
        key: encryptedKey.encryptedString,
        keys: { publicKey, encryptedPrivateKey: encryptedPrivateKey.encryptedString },
      },
      true,
      true,
    );
    await this.apiService.refreshIdentityToken();
    await this.syncService.fullSync(true);
  }

  /** The MSP's audit log, newest first, older than `before` if given. */
  async listEvents(mspId: string, before?: string, limit = 50): Promise<MspEvent[]> {
    const query = new URLSearchParams({ limit: String(limit) });
    if (before) {
      query.set("before", before);
    }
    return (
      await this.apiService.send("GET", `/keykeeper/msp/${mspId}/events?${query}`, null, true, true)
    ).data;
  }

  /** A client's enrollment token, for its RMM install command. */
  async getEnrollment(mspId: string, orgId: string): Promise<ClientEnrollment> {
    return this.apiService.send(
      "GET",
      `/keykeeper/msp/${mspId}/clients/${orgId}/enrollment`,
      null,
      true,
      true,
    );
  }

  /** Replaces a client's enrollment token; install commands with the old one stop working for new joins. */
  async replaceEnrollment(mspId: string, orgId: string): Promise<ClientEnrollment> {
    return this.apiService.send(
      "POST",
      `/keykeeper/msp/${mspId}/clients/${orgId}/enrollment`,
      null,
      true,
      true,
    );
  }

  /** For a client's owners and admins: the MSP that manages the organization, and its staff there. */
  async getOrganizationMsp(orgId: string): Promise<ClientMsp> {
    return this.apiService.send("GET", `/keykeeper/organizations/${orgId}/msp`, null, true, true);
  }

  /** For a client's own owners: removes the MSP and all of its staff from the organization. */
  async removeOrganizationMsp(orgId: string): Promise<void> {
    await this.apiService.send(
      "DELETE",
      `/keykeeper/organizations/${orgId}/msp`,
      null,
      true,
      false,
    );
  }

  async addStaff(mspId: string, email: string, role: MspRole): Promise<AddStaffResult> {
    return this.apiService.send(
      "POST",
      `/keykeeper/msp/${mspId}/staff`,
      { email, role },
      true,
      true,
    );
  }

  async cancelInvite(mspId: string, inviteId: string): Promise<void> {
    await this.apiService.send(
      "DELETE",
      `/keykeeper/msp/${mspId}/invites/${inviteId}`,
      null,
      true,
      false,
    );
  }

  async invitationInfo(token: string): Promise<InvitationInfo> {
    return this.apiService.send("POST", "/keykeeper/msp/invites/info", { token }, true, true);
  }

  async acceptInvitation(token: string): Promise<{ mspId: string; role: MspRole }> {
    return this.apiService.send("POST", "/keykeeper/msp/invites/accept", { token }, true, true);
  }

  async changeRole(mspId: string, userId: string, role: MspRole): Promise<void> {
    await this.apiService.send(
      "PUT",
      `/keykeeper/msp/${mspId}/staff/${userId}`,
      { role },
      true,
      false,
    );
  }

  async removeStaff(mspId: string, userId: string): Promise<void> {
    await this.apiService.send(
      "DELETE",
      `/keykeeper/msp/${mspId}/staff/${userId}`,
      null,
      true,
      false,
    );
  }

  /**
   * Confirms every membership waiting for an org key that this person can give,
   * with upstream's confirm request. Returns how many were confirmed.
   */
  async confirmPending(mspId: string): Promise<number> {
    const pending: Pending[] = (
      await this.apiService.send("GET", `/keykeeper/msp/${mspId}/pending`, null, true, true)
    ).data;
    if (pending.length === 0) {
      return 0;
    }
    // Org keys for clients created or joined since the last sync.
    await this.syncService.fullSync(false);
    const userId = await firstValueFrom(this.accountService.activeAccount$.pipe(getUserId));
    const organizations = await firstValueFrom(this.organizationService.organizations$(userId));
    let confirmed = 0;
    for (const p of pending) {
      const organization = organizations.find((o) => o.id === p.organizationId);
      if (organization == null) {
        continue;
      }
      await firstValueFrom(
        this.organizationUserService.confirmUser(
          organization,
          p.memberId,
          Utils.fromB64ToArray(p.publicKey),
        ),
      );
      confirmed++;
    }
    return confirmed;
  }
}
