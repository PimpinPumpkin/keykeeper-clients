import { mock } from "jest-mock-extended";
import { BehaviorSubject } from "rxjs";

import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { AuthService } from "@bitwarden/common/auth/abstractions/auth.service";
import { EncryptService } from "@bitwarden/common/key-management/crypto/abstractions/encrypt.service";
import { EncString } from "@bitwarden/common/key-management/crypto/models/enc-string";
import { ErrorResponse } from "@bitwarden/common/models/response/error.response";
import { Utils } from "@bitwarden/common/platform/misc/utils";
import { SyncService } from "@bitwarden/common/platform/sync";
import { UserId } from "@bitwarden/common/types/guid";
import { UserKey } from "@bitwarden/common/types/key";
import { KeyService } from "@bitwarden/key-management";

import { EnrollmentPlatform, EnrollmentState, KeykeeperEnrollment } from "./enrollment";

const userId = "user-1" as UserId;
const token = "t".repeat(43);
const orgPublicKey = Utils.fromBufferToB64(new Uint8Array([1, 2, 3, 4]).buffer);

function setUp(managedToken: string | null = token, saved: EnrollmentState = {}) {
  const apiService = mock<ApiService>();
  const keyService = mock<KeyService>();
  const encryptService = mock<EncryptService>();
  const syncService = mock<SyncService>();
  const userKey = { key: "user-key" } as unknown as UserKey;
  keyService.userKey$.mockReturnValue(new BehaviorSubject(userKey));
  encryptService.encapsulateKeyUnsigned.mockResolvedValue({
    encryptedString: "4.recovery",
  } as EncString);
  let state = saved;
  const notices: [string, string][] = [];
  const platform: EnrollmentPlatform = {
    managedToken: async () => managedToken,
    load: async () => JSON.parse(JSON.stringify(state)),
    save: async (next) => {
      state = next;
    },
    notify: async (title, message) => {
      notices.push([title, message]);
    },
  };
  const enrollment = new KeykeeperEnrollment(
    mock<AccountService>(),
    mock<AuthService>(),
    apiService,
    keyService,
    encryptService,
    syncService,
    platform,
  );
  const info = (accountRecovery: boolean, publicKey: string | null = orgPublicKey) => ({
    organizationId: "org-1",
    organizationName: "Acme Dental",
    publicKey,
    accountRecovery,
  });
  return {
    enrollment,
    apiService,
    encryptService,
    syncService,
    userKey,
    notices,
    state: () => state,
    info,
  };
}

describe("Keykeeper enrollment through the install command", () => {
  it("does nothing without a token from browser policy", async () => {
    const { enrollment, apiService } = setUp(null);

    expect(await enrollment.run(userId)).toBe("no-token");
    expect(apiService.send).not.toHaveBeenCalled();
  });

  it("joins with the user key encrypted to the organization's public key when it uses account recovery", async () => {
    const { enrollment, apiService, encryptService, syncService, userKey, notices, state, info } =
      setUp();
    apiService.send.mockResolvedValueOnce(info(true)).mockResolvedValueOnce({ status: 1 });

    expect(await enrollment.run(userId)).toBe("joined");

    expect(apiService.send).toHaveBeenNthCalledWith(
      1,
      "POST",
      "/keykeeper/enrollment/info",
      { token },
      true,
      true,
    );
    expect(encryptService.encapsulateKeyUnsigned).toHaveBeenCalledWith(
      userKey,
      Utils.fromB64ToArray(orgPublicKey),
    );
    expect(apiService.send).toHaveBeenNthCalledWith(
      2,
      "POST",
      "/keykeeper/enrollment/join",
      { token, resetPasswordKey: "4.recovery" },
      true,
      true,
    );
    expect(notices).toEqual([
      [
        "You joined Acme Dental",
        "An admin will confirm you shortly. Its admins can recover your account if you forget your master password.",
      ],
    ]);
    expect(state()[userId]).toEqual({ token, result: "joined" });
    expect(syncService.fullSync).toHaveBeenCalledWith(true);
  });

  it("sends no recovery key when the organization doesn't use account recovery", async () => {
    const { enrollment, apiService, encryptService, notices, info } = setUp();
    apiService.send.mockResolvedValueOnce(info(false)).mockResolvedValueOnce({ status: 1 });

    await enrollment.run(userId);

    expect(encryptService.encapsulateKeyUnsigned).not.toHaveBeenCalled();
    expect(apiService.send).toHaveBeenLastCalledWith(
      "POST",
      "/keykeeper/enrollment/join",
      { token, resetPasswordKey: undefined },
      true,
      true,
    );
    expect(notices[0][1]).toBe("An admin will confirm you shortly.");
  });

  it("joins once per account and token, and again for a new token", async () => {
    const done = setUp(token, { [userId]: { token, result: "joined" } });
    expect(await done.enrollment.run(userId)).toBe("already-done");
    expect(done.apiService.send).not.toHaveBeenCalled();

    const replaced = setUp("n".repeat(43), { [userId]: { token, result: "joined" } });
    replaced.apiService.send
      .mockResolvedValueOnce(replaced.info(false))
      .mockResolvedValueOnce({ status: 2 });
    expect(await replaced.enrollment.run(userId)).toBe("joined");
    // Already a member: nothing to announce.
    expect(replaced.notices).toEqual([]);
  });

  it("never sends a recovery key without the organization's public key", async () => {
    const { enrollment, apiService, encryptService, notices, info } = setUp();
    apiService.send.mockResolvedValueOnce(info(true, null));

    expect(await enrollment.run(userId)).toBe("failed");
    expect(encryptService.encapsulateKeyUnsigned).not.toHaveBeenCalled();
    expect(apiService.send).toHaveBeenCalledTimes(1);
    expect(notices[0][1]).toContain("no public key");
  });

  it("tells the person about a problem once, not at every unlock", async () => {
    const refused = new ErrorResponse(
      { message: "Cannot join because another organization policy forbids it" },
      400,
    );
    const { enrollment, apiService, notices, info, state } = setUp();
    apiService.send.mockResolvedValueOnce(info(false)).mockRejectedValueOnce(refused);
    expect(await enrollment.run(userId)).toBe("failed");
    expect(notices).toEqual([
      [
        "Couldn't join your organization",
        "Cannot join because another organization policy forbids it",
      ],
    ]);

    const again = setUp(token, state());
    again.apiService.send.mockResolvedValueOnce(again.info(false)).mockRejectedValueOnce(refused);
    expect(await again.enrollment.run(userId)).toBe("failed");
    expect(again.notices).toEqual([]);
  });
});
