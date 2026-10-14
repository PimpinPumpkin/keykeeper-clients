import { Component, OnInit } from "@angular/core";

import { OrganizationService } from "@bitwarden/common/admin-console/abstractions/organization/organization.service.abstraction";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { SyncService } from "@bitwarden/common/vault/abstractions/sync/sync.service.abstraction";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { DialogService } from "@bitwarden/components";
import { LogService } from "@bitwarden/logging";
import {
  CipherFormConfigService,
  expirationStatus,
  itemExpiration,
  PasswordRepromptService,
} from "@bitwarden/vault";

import { AdminConsoleCipherFormConfigService } from "../../../vault/org-vault/services/admin-console-cipher-form-config.service";

import { CipherReportComponent } from "./cipher-report.component";

/**
 * Keykeeper: items that have expired or expire in the next 30 days, soonest
 * first. Uses each item's expiration date, or a card's expiry month.
 */
// eslint-disable-next-line @angular-eslint/prefer-on-push-component-change-detection
@Component({
  selector: "app-keykeeper-expiring-items-report",
  templateUrl: "keykeeper-expiring-items-report.component.html",
  standalone: false,
})
export class KeykeeperExpiringItemsReportComponent extends CipherReportComponent implements OnInit {
  constructor(
    protected cipherService: CipherService,
    protected organizationService: OrganizationService,
    dialogService: DialogService,
    accountService: AccountService,
    passwordRepromptService: PasswordRepromptService,
    i18nService: I18nService,
    syncService: SyncService,
    cipherFormConfigService: CipherFormConfigService,
    adminConsoleCipherFormConfigService: AdminConsoleCipherFormConfigService,
    protected logService: LogService,
  ) {
    super(
      cipherService,
      dialogService,
      passwordRepromptService,
      organizationService,
      accountService,
      i18nService,
      syncService,
      cipherFormConfigService,
      adminConsoleCipherFormConfigService,
      logService,
    );
  }

  async ngOnInit() {
    await super.load();
  }

  async setCiphers() {
    const now = new Date();
    const expiring = (await this.getAllCiphers())
      .filter((cipher) => !cipher.isDeleted)
      .map((cipher) => ({ cipher, expires: itemExpiration(cipher) }))
      .filter(({ expires }) => expires != null && expirationStatus(expires, now).state !== "later")
      .sort((a, b) => a.expires!.getTime() - b.expires!.getTime())
      .map(({ cipher }) => cipher);
    this.filterCiphersByOrg(expiring);
  }

  /** The expiry date, formatted for the person's locale. */
  protected expiresOn(cipher: CipherView): string {
    const expires = itemExpiration(cipher);
    return expires
      ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(expires)
      : "";
  }
}
