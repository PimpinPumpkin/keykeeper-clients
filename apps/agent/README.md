# Desktop agent

PassBundle's desktop app: a tray app (menu bar on macOS) with no windows, written in Rust. It replaces upstream's Electron desktop app, which we don't ship. The design is in the meta repo's DESIGN.md, "Desktop agent".

Version 0.1 is the foundation: the tray icon and menu (the version, Open web vault, Quit), one agent per signed-in user, settings by policy, and a self-updater that installs only releases signed with our offline update key. Next come Windows Hello and Touch ID unlock for the extension, then the MSP background work the web vault and extension already do.

## Why it's its own workspace

Upstream's `apps/desktop/desktop_native` crates are GPL-3.0, but some of them link Bitwarden's SDK crates (from `sdk-internal`), which declare a license file instead of a standard open-source license, and `bitwarden-russh`, which declares none. `biometric` uses the SDK crates and `desktop_core` uses `bitwarden-russh`. The agent links neither: it's a separate Cargo workspace, and anything it takes from upstream's GPL code is copied in with a note saying where from.

## Build and test

```bash
cd apps/agent
cargo test
cargo clippy --all-targets -- -D warnings
cargo build --release
```

The name, domain, and web vault URL come from `brand/brand.json` at build time, and the tray icons from `brand/assets/generated/agent/` (made by `brand/render-assets.sh`). Tier 1 runs all of this on Windows and macOS, checks the release build is under 10 MB, and runs it in the tray.

## Settings by policy

Read only from places a standard user can't write:

| Setting | Windows (`HKLM\SOFTWARE\Policies\PassBundle\Agent`) | macOS (managed preferences, `com.passbundle.agent`) |
| --- | --- | --- |
| Web vault to open | `ServerUrl` (string, `https://` only) | `ServerUrl` (string) |
| Self-updates | `Updates` (DWORD, 0 turns them off) | `Updates` (boolean) |

Without a policy the agent opens the brand's web vault and updates itself. MSPs that push the agent through their RMM can turn updates off.

## Updates

`passbundle-agent --update` checks `https://passbundle.com/agent/<target>.json` (targets are `windows-x86_64`, `macos-aarch64`, and so on), a manifest like:

```json
{
  "product": "passbundle-agent",
  "version": "0.2.0",
  "target": "windows-x86_64",
  "url": "https://passbundle.com/agent/passbundle-agent-0.2.0-windows-x86_64.exe",
  "size": 912384,
  "sha256": "<64 hex digits>"
}
```

and its minisign signature, `<target>.json.minisig`. It installs the release only if the signature verifies with the public key compiled in (`update-key.pub`), the manifest is for this product and platform, the version is newer, the file is served over HTTPS, and the download has the stated size and SHA-256. The running executable is moved aside, not overwritten, so a failure leaves a working agent. TLS is the operating system's (SChannel, Security.framework), with its certificate store.

The installer will run `--update` from a scheduled task (Windows) or a launch daemon (macOS), since replacing an installed agent needs admin rights. The tray agent itself never accepts commands from the network.

### The update key

There is no `update-key.pub` yet, so builds don't update themselves. To create the key, on an offline machine:

```bash
minisign -G -p update-key.pub -s passbundle-update.key
```

Keep `passbundle-update.key` and its password offline (DESIGN.md, "Updates"). Commit only `update-key.pub`, here. To sign a release manifest:

```bash
minisign -S -s passbundle-update.key -m windows-x86_64.json
```

Then publish the manifest, its `.minisig`, and the binary under the site's `agent/` folder.

## Not built yet

- Installing the agent from `Install-PassBundle.ps1`, with autostart and the update task. Waits on signed builds (Authenticode on Windows, a Developer ID on macOS).
- Windows Hello and Touch ID unlock for the extension. The extension holds the keys and the agent has no login, so the extension hands the agent the user key when someone turns biometric unlock on. That's a change to key handling, so it gets a design note and test vectors first.
- The MSP background work (confirming members, keeping template copies current).
