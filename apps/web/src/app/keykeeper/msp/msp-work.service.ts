import { Injectable } from "@angular/core";

import {
  CollectionAdminService,
  KeykeeperMspWork,
  KeykeeperTemplateSender,
  OrganizationUserService,
} from "@bitwarden/admin-console/common";
import { OrganizationService } from "@bitwarden/common/admin-console/abstractions/organization/organization.service.abstraction";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { AuthService } from "@bitwarden/common/auth/abstractions/auth.service";
import { SyncService } from "@bitwarden/common/platform/sync";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";

import { KeykeeperMspApiService } from "./msp-api.service";

/** Keykeeper: the shared template sender, with the web vault's services. */
@Injectable({ providedIn: "root" })
export class KeykeeperTemplateSenderService extends KeykeeperTemplateSender {
  constructor(
    mspApi: KeykeeperMspApiService,
    cipherService: CipherService,
    collectionAdminService: CollectionAdminService,
    accountService: AccountService,
    syncService: SyncService,
  ) {
    super(mspApi, cipherService, collectionAdminService, accountService, syncService);
  }
}

/**
 * Keykeeper: an MSP's background work in the web vault (confirming members
 * waiting for their org key, keeping clients' templates current), started at
 * startup by InitService. The browser extension runs the same work.
 */
@Injectable({ providedIn: "root" })
export class KeykeeperMspWorkService extends KeykeeperMspWork {
  constructor(
    mspApi: KeykeeperMspApiService,
    sender: KeykeeperTemplateSenderService,
    accountService: AccountService,
    authService: AuthService,
    cipherService: CipherService,
    organizationService: OrganizationService,
    organizationUserService: OrganizationUserService,
    syncService: SyncService,
  ) {
    super(
      mspApi,
      sender,
      accountService,
      authService,
      cipherService,
      organizationService,
      organizationUserService,
      syncService,
    );
  }
}
