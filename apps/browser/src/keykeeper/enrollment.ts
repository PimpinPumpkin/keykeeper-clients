// Keykeeper: joining a client organization through the MSP's install command.
// The command gives the extension an enrollment token through browser policy.
// After the person unlocks, the extension asks the server which organization
// the token belongs to and joins it. When that organization enrolls members in
// account recovery, the person's user key is encrypted to the organization's
// public key first, exactly as upstream's enrollment does
// (PasswordResetEnrollmentServiceImplementation.enroll). The join never
// includes the org key; the member waits to be confirmed. See DESIGN.md,
// "Onboarding through the RMM".

import { distinctUntilChanged, filter, firstValueFrom, map, of, switchMap } from "rxjs";

import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { AuthService } from "@bitwarden/common/auth/abstractions/auth.service";
import { AuthenticationStatus } from "@bitwarden/common/auth/enums/authentication-status";
import { getOptionalUserId } from "@bitwarden/common/auth/services/account.service";
import { EncryptService } from "@bitwarden/common/key-management/crypto/abstractions/encrypt.service";
import { ErrorResponse } from "@bitwarden/common/models/response/error.response";
import { Utils } from "@bitwarden/common/platform/misc/utils";
import { SyncService } from "@bitwarden/common/platform/sync";
import { UserId } from "@bitwarden/common/types/guid";
import { KeyService } from "@bitwarden/key-management";

const STORAGE_KEY = "keykeeper.enrollment";
const NOTIFICATION_ID = "keykeeper-enrollment";
const ACCEPTED = 1;

/** The last outcome for each account: joined, or the error it got, for the token it tried. */
export type EnrollmentState = Record<
  string,
  { token: string; result: "joined" | { error: string } }
>;

/** What the extension needs from the browser, so the logic can be tested without one. */
export interface EnrollmentPlatform {
  /** The enrollment token from browser policy, if any. */
  managedToken(): Promise<string | null>;
  load(): Promise<EnrollmentState>;
  save(state: EnrollmentState): Promise<void>;
  notify(title: string, message: string): Promise<void>;
}

export const chromeEnrollmentPlatform: EnrollmentPlatform = {
  async managedToken() {
    if (chrome.storage?.managed == null) {
      return null;
    }
    try {
      const { enrollmentToken } = await chrome.storage.managed.get("enrollmentToken");
      return typeof enrollmentToken === "string" && enrollmentToken.trim() !== ""
        ? enrollmentToken.trim()
        : null;
    } catch {
      // No policy store on this browser.
      return null;
    }
  },
  async load() {
    return (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] ?? {};
  },
  async save(state) {
    await chrome.storage.local.set({ [STORAGE_KEY]: state });
  },
  async notify(title, message) {
    await chrome.notifications.create(NOTIFICATION_ID, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("images/icon128.png"),
      title,
      message,
      priority: 1,
    });
  },
};

type EnrollmentInfo = {
  organizationId: string;
  organizationName: string;
  publicKey: string | null;
  accountRecovery: boolean;
};

export type EnrollmentOutcome = "no-token" | "already-done" | "joined" | "failed";

export class KeykeeperEnrollment {
  constructor(
    private readonly accountService: AccountService,
    private readonly authService: AuthService,
    private readonly apiService: ApiService,
    private readonly keyService: KeyService,
    private readonly encryptService: EncryptService,
    private readonly syncService: SyncService,
    private readonly platform: EnrollmentPlatform = chromeEnrollmentPlatform,
  ) {}

  /** Tries to join whenever an account is unlocked. */
  init() {
    this.accountService.activeAccount$
      .pipe(
        getOptionalUserId,
        switchMap((userId) =>
          userId == null
            ? of(null)
            : this.authService
                .authStatusFor$(userId)
                .pipe(map((status) => (status === AuthenticationStatus.Unlocked ? userId : null))),
        ),
        distinctUntilChanged(),
        filter((userId): userId is UserId => userId != null),
      )
      .subscribe((userId) => void this.run(userId));
  }

  /** Joins the organization the managed token belongs to, once per account and token. */
  async run(userId: UserId): Promise<EnrollmentOutcome> {
    const token = await this.platform.managedToken();
    if (token == null) {
      return "no-token";
    }
    const state = await this.platform.load();
    const previous = state[userId];
    if (previous?.token === token && previous.result === "joined") {
      return "already-done";
    }

    try {
      const info: EnrollmentInfo = await this.apiService.send(
        "POST",
        "/keykeeper/enrollment/info",
        { token },
        true,
        true,
      );
      const resetPasswordKey = info.accountRecovery
        ? await this.recoveryKey(userId, info.publicKey)
        : undefined;
      const joined: { status: number } = await this.apiService.send(
        "POST",
        "/keykeeper/enrollment/join",
        { token, resetPasswordKey },
        true,
        true,
      );
      state[userId] = { token, result: "joined" };
      await this.platform.save(state);
      if (joined.status === ACCEPTED) {
        await this.platform.notify(
          `You joined ${info.organizationName}`,
          info.accountRecovery
            ? "An admin will confirm you shortly. Its admins can recover your account if you forget your master password."
            : "An admin will confirm you shortly.",
        );
      }
      await this.syncService.fullSync(true);
      return "joined";
    } catch (e) {
      const error = e instanceof ErrorResponse ? e.getSingleMessage() : String(e);
      // Tell the person once per problem, not at every unlock.
      const sameAsBefore =
        previous?.token === token &&
        typeof previous.result === "object" &&
        previous.result.error === error;
      if (!sameAsBefore) {
        await this.platform.notify("Couldn't join your organization", error);
      }
      state[userId] = { token, result: { error } };
      await this.platform.save(state);
      return "failed";
    }
  }

  /** The user key encrypted to the organization's public key, as upstream's enrollment does. */
  private async recoveryKey(userId: UserId, publicKey: string | null): Promise<string> {
    if (!publicKey) {
      throw new Error("The organization has no public key for account recovery.");
    }
    const userKey = await firstValueFrom(this.keyService.userKey$(userId));
    if (userKey == null) {
      throw new Error("Unlock to join your organization.");
    }
    const encrypted = await this.encryptService.encapsulateKeyUnsigned(
      userKey,
      Utils.fromB64ToArray(publicKey),
    );
    return encrypted.encryptedString;
  }
}
