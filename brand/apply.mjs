#!/usr/bin/env node
// Applies the brand in brand/brand.json to this working tree before a build,
// and reverts it afterwards. Upstream files stay untouched in git, so merges
// from bitwarden/clients never conflict with branding.
//
//   node brand/apply.mjs            apply
//   node brand/apply.mjs --revert   restore every file apply touched
//
// Apply refuses to run over uncommitted changes in apps/ or libs/, because
// revert restores files from git. It fails loudly when an upstream file no
// longer looks the way this script expects.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BRAND = JSON.parse(fs.readFileSync(path.join(ROOT, "brand/brand.json"), "utf8"));
const GEN = path.join(ROOT, "brand/assets/generated");
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
// Kept inside .git so it never shows up as a change and needs no .gitignore entry.
const STATE = path.resolve(
  ROOT,
  git("rev-parse", "--git-dir").trim(),
  "keykeeper-brand-applied.json",
);
const abs = (rel) => path.join(ROOT, rel);
const read = (rel) => fs.readFileSync(abs(rel), "utf8");

function fail(message) {
  console.error(`brand: ${message}`);
  process.exit(1);
}

const touched = new Set();
function write(rel, content) {
  fs.writeFileSync(abs(rel), content);
  touched.add(rel);
}
function copyInto(fromAbs, rel) {
  if (!fs.existsSync(abs(rel))) {
    fail(`${rel} does not exist upstream anymore. Update brand/apply.mjs.`);
  }
  fs.copyFileSync(fromAbs, abs(rel));
  touched.add(rel);
}
function replaceAnchored(rel, pattern, replacement) {
  const source = read(rel);
  if (!pattern.test(source)) {
    fail(
      `expected pattern not found in ${rel}: ${pattern}. Upstream changed. Update brand/apply.mjs.`,
    );
  }
  write(rel, source.replace(pattern, replacement));
}

// GPLv3 section 5(d) requires keeping the original copyright notice in the UI.
const COPYRIGHT_TOKEN = "\u0000COPYRIGHT\u0000";
function brandText(text) {
  return text
    .replaceAll("Bitwarden Inc.", COPYRIGHT_TOKEN)
    .replace(/(https?:\/\/)?(www\.)?bitwarden\.(com|eu)/g, BRAND.urls.website)
    .replace(/\bBitwarden\b/g, BRAND.name)
    .replaceAll(COPYRIGHT_TOKEN, `Bitwarden Inc. and ${BRAND.name} contributors`);
}

function trackedFiles(...pathspecs) {
  return git("ls-files", "--", ...pathspecs, ":!:bitwarden_license/**")
    .split("\n")
    .filter(Boolean);
}

function revert() {
  if (!fs.existsSync(STATE)) {
    console.log("brand: nothing to revert");
    return;
  }
  const files = JSON.parse(fs.readFileSync(STATE, "utf8"));
  for (let i = 0; i < files.length; i += 200) {
    git("checkout", "--", ...files.slice(i, i + 200));
  }
  fs.rmSync(STATE);
  console.log(`brand: reverted ${files.length} files`);
}

function apply() {
  if (fs.existsSync(STATE)) {
    fail("branding is already applied. Run with --revert first.");
  }
  const dirty = git("status", "--porcelain", "--untracked-files=no", "--", "apps", "libs").trim();
  if (dirty) {
    fail("apps/ or libs/ has uncommitted changes. Commit or stash them first.");
  }
  // Record progress as we go, so a failure halfway can still be reverted.
  process.on("exit", () => {
    if (touched.size) fs.writeFileSync(STATE, JSON.stringify([...touched].sort(), null, 2));
  });

  // 1. Translations, in every language.
  const locales = trackedFiles(
    "apps/browser/src/_locales/*/messages.json",
    "apps/web/src/locales/*/messages.json",
    "apps/desktop/src/locales/*/messages.json",
    "apps/cli/src/locales/*/messages.json",
  );
  if (locales.length < 150) fail(`found only ${locales.length} locale files. Upstream moved them?`);
  for (const rel of locales) {
    const data = JSON.parse(read(rel).replace(/^﻿/, ""));
    for (const entry of Object.values(data)) {
      if (typeof entry?.message === "string") entry.message = brandText(entry.message);
    }
    write(rel, JSON.stringify(data, null, 2) + "\n");
  }

  // 2. Hard-coded text in HTML templates.
  let templates = 0;
  for (const rel of trackedFiles("apps/**/*.html", "apps/**/*.ejs", "libs/**/*.html")) {
    const source = read(rel);
    const branded = brandText(source);
    if (branded !== source) {
      write(rel, branded);
      templates++;
    }
  }

  // 3. Logos used by the shared component library.
  const themedWordmark = fs.readFileSync(path.join(GEN, "wordmark-themed.svg"), "utf8");
  const themedMark = fs.readFileSync(path.join(GEN, "mark-themed.svg"), "utf8");
  replaceAnchored(
    "libs/assets/src/svg/svgs/bitwarden-logo.icon.ts",
    /export const BitwardenLogo = svg`[\s\S]*?`;/,
    `export const BitwardenLogo = svg\`${themedWordmark}\`;`,
  );
  replaceAnchored(
    "libs/assets/src/svg/svgs/shield.ts",
    /const BitwardenShield = svg`[\s\S]*?`;/,
    `const BitwardenShield = svg\`${themedMark}\`;`,
  );
  const svgModules = [
    ["password-manager.ts", "const PasswordManagerLogo", "logo-password-manager.svg"],
    ["admin-console.ts", "const AdminConsoleLogo", "logo-admin-console.svg"],
    ["provider-portal.ts", "const ProviderPortalLogo", "logo-provider-portal.svg"],
    ["secrets-manager.ts", "const SecretsManagerLogo", "logo-secrets-manager.svg"],
    ["bitwarden-icon.ts", "export const BitwardenIcon", "icon-square.svg"],
  ];
  for (const [file, declaration, asset] of svgModules) {
    const markup = fs.readFileSync(path.join(GEN, asset), "utf8");
    replaceAnchored(
      `libs/assets/src/svg/svgs/${file}`,
      new RegExp(`${declaration} = svg\`[\\s\\S]*?\`;`),
      `${declaration} = svg\`${markup}\`;`,
    );
  }

  // 4. Cloud regions: ours replace Bitwarden's US, EU, and Gov clouds.
  const u = BRAND.urls;
  replaceAnchored(
    "libs/common/src/platform/services/default-environment.service.ts",
    /export const PRODUCTION_REGIONS: RegionConfig\[\] = \[[\s\S]*?\n\];/,
    `export const PRODUCTION_REGIONS: RegionConfig[] = [
  {
    key: Region.US,
    domain: ${JSON.stringify(BRAND.domain)},
    urls: {
      base: null,
      api: ${JSON.stringify(u.api)},
      identity: ${JSON.stringify(u.identity)},
      icons: ${JSON.stringify(u.icons)},
      webVault: ${JSON.stringify(u.webVault)},
      notifications: ${JSON.stringify(u.notifications)},
      events: ${JSON.stringify(u.events)},
      scim: ${JSON.stringify(u.scim)},
      send: ${JSON.stringify(u.send)},
    },
  },
];`,
  );

  // 5. Browser extension manifests and icons.
  for (const rel of ["apps/browser/src/manifest.json", "apps/browser/src/manifest.v3.json"]) {
    const manifest = JSON.parse(read(rel));
    if (manifest.author !== "Bitwarden Inc.") fail(`unexpected author in ${rel}`);
    manifest.author = BRAND.company;
    write(rel, brandText(JSON.stringify(manifest, null, 2)) + "\n");
  }
  for (const file of fs.readdirSync(path.join(GEN, "browser"))) {
    copyInto(path.join(GEN, "browser", file), `apps/browser/src/images/${file}`);
  }

  // 6. Web vault: app manifest, U2F facets, icons, and logos.
  write("apps/web/src/manifest.json", brandText(read("apps/web/src/manifest.json")));
  write(
    "apps/web/src/app-id.json",
    JSON.stringify(
      { trustedFacets: [{ version: { major: 1, minor: 0 }, ids: [BRAND.urls.webVault] }] },
      null,
      2,
    ) + "\n",
  );
  replaceAnchored("apps/web/src/index.html", /color="#175DDC"/, `color="${BRAND.color}"`);
  for (const file of fs.readdirSync(path.join(GEN, "web"))) {
    const from = path.join(GEN, "web", file);
    if (file === "favicon.ico") copyInto(from, "apps/web/src/favicon.ico");
    else if (file.startsWith("logo")) copyInto(from, `apps/web/src/images/${file}`);
    else copyInto(from, `apps/web/src/images/icons/${file}`);
  }

  console.log(
    `brand: applied "${BRAND.name}" to ${touched.size} files ` +
      `(${locales.length} locale files, ${templates} templates)`,
  );
}

if (process.argv.includes("--revert")) revert();
else apply();
