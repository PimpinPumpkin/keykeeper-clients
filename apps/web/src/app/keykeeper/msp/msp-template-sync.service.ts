// Keykeeper: keeps every client's copies of an MSP's templates current, so a
// template simply applies to the clients it's for. Each copy is encrypted for
// its client, which only a browser holding that client's key can do, so this
// runs in the web vault of any MSP admin who is signed in: when they unlock,
// whenever their items change (such as after editing a template), and when
// the MSP console asks. See DESIGN.md, "MSP templates".

import { Injectable } from "@angular/core";
import { EMPTY, Subject, debounceTime, firstValueFrom, switchMap } from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { AuthService } from "@bitwarden/common/auth/abstractions/auth.service";
import { AuthenticationStatus } from "@bitwarden/common/auth/enums/authentication-status";
import { getUserId } from "@bitwarden/common/auth/services/account.service";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";

import { KeykeeperMspApiService, MspDetails } from "./msp-api.service";
import { KeykeeperTemplateSender } from "./msp-template-sender.service";
import { KnownItem, templateRows } from "./msp-templates";

const CONFIRMED = 2;
/** Waits for a burst of changes, such as a sync, to settle. */
const SETTLE_MS = 3000;

export function knownItems(items: CipherView[]): Map<string, KnownItem> {
  return new Map(
    items.map((c): [string, KnownItem] => [
      c.id,
      {
        name: c.name,
        revision: c.revisionDate.toISOString(),
        deleted: c.isDeleted,
        organizationId: c.organizationId ?? null,
      },
    ]),
  );
}

@Injectable({ providedIn: "root" })
export class KeykeeperTemplateSync {
  private running: Promise<string[]> | null = null;
  private rerun = false;
  /**
   * Copies that failed this session, by template, client, and source version.
   * Automatic updates skip them so a lasting failure can't repeat forever;
   * "Update" in the console tries them again.
   */
  private readonly failed = new Set<string>();
  private readonly updated = new Subject<void>();
  /** Emits after copies were written, so the console can show it. */
  readonly updated$ = this.updated.asObservable();

  constructor(
    private readonly accountService: AccountService,
    private readonly authService: AuthService,
    private readonly cipherService: CipherService,
    private readonly mspApi: KeykeeperMspApiService,
    private readonly sender: KeykeeperTemplateSender,
  ) {}

  /** Watches for unlocks and item changes. Called once, at startup. */
  start() {
    this.accountService.activeAccount$
      .pipe(
        switchMap((account) =>
          account == null
            ? EMPTY
            : this.authService
                .authStatusFor$(account.id)
                .pipe(
                  switchMap((status) =>
                    status === AuthenticationStatus.Unlocked
                      ? this.cipherService.ciphers$(account.id)
                      : EMPTY,
                  ),
                ),
        ),
        debounceTime(SETTLE_MS),
      )
      .subscribe(() => void this.updateNow());
  }

  /**
   * Brings every client of every MSP the person administers up to date. One
   * update runs at a time; a request during one runs once more after it.
   * Never throws. `retry` also tries copies that failed earlier. Resolves to
   * what failed, in sentences such as "Firewall in Acme Dental: ...".
   */
  async updateNow(retry = false): Promise<string[]> {
    if (retry) {
      this.failed.clear();
    }
    if (this.running != null) {
      this.rerun = true;
      return this.running;
    }
    this.running = this.updateAll()
      .catch((e: unknown) => [e instanceof Error ? e.message : String(e)])
      .finally(() => {
        this.running = null;
        if (this.rerun) {
          this.rerun = false;
          void this.updateNow();
        }
      });
    return this.running;
  }

  private async updateAll(): Promise<string[]> {
    const failures: string[] = [];
    const msps = (await this.mspApi.list()).filter((m) => m.role === "admin");
    if (msps.length === 0) {
      return failures;
    }
    const userId = await firstValueFrom(this.accountService.activeAccount$.pipe(getUserId));
    let wrote = false;
    for (const summary of msps) {
      const [msp, state] = await Promise.all([
        this.mspApi.get(summary.id),
        this.mspApi.getTemplates(summary.id),
      ]);
      if (state.templates.length === 0) {
        continue;
      }
      const items = await this.cipherService.getAllDecrypted(userId);
      const rows = templateRows(
        state,
        msp.clients.map(({ id, name }) => ({ id, name })),
        knownItems(items),
      );
      for (const row of rows) {
        const source = items.find((c) => c.id === row.sourceCipherId);
        if (!row.sourceVisible || source == null) {
          continue;
        }
        const revision = source.revisionDate.toISOString();
        const key = (clientId: string) => `${row.templateId}:${clientId}:${revision}`;
        const behind = keyed(msp, row.behind).filter((c) => !this.failed.has(key(c.id)));
        if (behind.length === 0) {
          continue;
        }
        const result = await this.sender.send(msp, source, behind, state);
        for (const f of result.failed) {
          this.failed.add(key(f.id));
          failures.push(`${source.name} in ${f.name}: ${f.error}`);
        }
        wrote ||= result.sent.length > 0;
      }
    }
    if (wrote) {
      this.updated.next();
    }
    return failures;
  }
}

/** Clients whose key the person holds, so a copy can be encrypted for them. */
function keyed(msp: MspDetails, clients: { id: string; name: string }[]) {
  const confirmed = new Set(
    msp.clients.filter((c) => c.you?.status === CONFIRMED).map((c) => c.id),
  );
  return clients.filter((c) => confirmed.has(c.id));
}
