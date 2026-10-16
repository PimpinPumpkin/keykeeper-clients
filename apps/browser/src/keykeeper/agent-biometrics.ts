// Keykeeper: biometric unlock through the PassBundle desktop agent. Upstream's
// desktop app has its own login and holds the user key; the agent has
// neither, so when someone turns on "Unlock with biometrics" the extension
// gives the agent the user key over the encrypted native-messaging channel,
// and the agent keeps it behind Windows Hello. Turning it off, or logging out,
// takes it back. Unlocking is upstream's code, unchanged. See DESIGN.md,
// "Biometric unlock".

import { firstValueFrom } from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { UserId } from "@bitwarden/common/types/guid";
import { KeyService } from "@bitwarden/key-management";

import type { NativeMessagingBackground } from "../background/nativeMessaging.background";

import { ENROLL_BIOMETRICS, REMOVE_BIOMETRICS } from "./agent-biometrics-messages";

/** Logging out waits this long for the agent at most. */
const REMOVE_TIMEOUT_MS = 2000;

type Agent = Pick<NativeMessagingBackground, "callCommand">;
type EnrollMessage = { command: string; userKeyB64: string; email: string };
type RemoveMessage = { command: string; forUserId: UserId };

export class KeykeeperAgentBiometrics {
  constructor(
    private readonly agent: () => Agent,
    private readonly keyService: KeyService,
    private readonly accountService: AccountService,
  ) {}

  /**
   * Gives the agent the active account's user key, after the person confirms
   * with Windows Hello. Resolves to whether they did; false too if the agent
   * isn't running or the vault is locked.
   */
  async enroll(userId: UserId): Promise<boolean> {
    const active = await firstValueFrom(this.accountService.activeAccount$);
    // The channel always speaks for the active account.
    if (active?.id !== userId) {
      return false;
    }
    const userKey = await firstValueFrom(this.keyService.userKey$(userId));
    if (userKey == null) {
      return false;
    }
    // Our commands carry more than upstream's message type lists; the
    // channel sends the whole object.
    const message: EnrollMessage = {
      command: ENROLL_BIOMETRICS,
      userKeyB64: userKey.toBase64(),
      email: active.email,
    };
    try {
      const reply = await this.agent().callCommand(message);
      return reply?.response === true;
    } catch {
      return false;
    }
  }

  /** Has the agent forget an account's key. Never throws, never waits long. */
  async remove(userId: UserId): Promise<void> {
    const message: RemoveMessage = { command: REMOVE_BIOMETRICS, forUserId: userId };
    const removed = this.agent()
      .callCommand(message)
      .catch((): void => undefined);
    await Promise.race([removed, new Promise((resolve) => setTimeout(resolve, REMOVE_TIMEOUT_MS))]);
  }
}
