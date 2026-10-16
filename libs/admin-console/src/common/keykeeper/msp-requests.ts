// Keykeeper: the MSP API calls (/api/keykeeper/msp on the server) that an
// MSP's background work needs, in the web vault and the browser extension.
// The web vault's KeykeeperMspApiService adds the console's own calls.

import { ApiService } from "@bitwarden/common/abstractions/api.service";

import { MspDetails, MspSummary, MspTemplates, PendingMember, TemplateCopy } from "./msp-types";

export class KeykeeperMspRequests {
  constructor(protected readonly apiService: ApiService) {}

  /** The MSPs the person is staff of, with their role in each. */
  async list(): Promise<MspSummary[]> {
    return (await this.apiService.send("GET", "/keykeeper/msp", null, true, true)).data;
  }

  async get(mspId: string): Promise<MspDetails> {
    return this.apiService.send("GET", `/keykeeper/msp/${mspId}`, null, true, true);
  }

  /** Memberships waiting for an org key in clients where the person can confirm them. */
  async pending(mspId: string): Promise<PendingMember[]> {
    return (await this.apiService.send("GET", `/keykeeper/msp/${mspId}/pending`, null, true, true))
      .data;
  }

  async getTemplates(mspId: string): Promise<MspTemplates> {
    return this.apiService.send("GET", `/keykeeper/msp/${mspId}/templates`, null, true, true);
  }

  /** Records the copies just written into clients. */
  async recordTemplateCopies(
    mspId: string,
    templateId: string,
    copies: TemplateCopy[],
  ): Promise<void> {
    await this.apiService.send(
      "POST",
      `/keykeeper/msp/${mspId}/templates/${templateId}/copies`,
      { copies },
      true,
      false,
    );
  }

  /** Records a client's Templates collection. */
  async setTemplatesCollection(mspId: string, orgId: string, collectionId: string): Promise<void> {
    await this.apiService.send(
      "PUT",
      `/keykeeper/msp/${mspId}/clients/${orgId}/templates-collection`,
      { collectionId },
      true,
      true,
    );
  }
}
