# Agent instructions (keykeeper-clients)

This is the Keykeeper fork of `bitwarden/clients`. The project-wide rules live in the meta repo: [PimpinPumpkin/keykeeper/AGENTS.md](https://github.com/PimpinPumpkin/keykeeper/blob/main/AGENTS.md). Locally it is `../keykeeper/AGENTS.md`. Read it first. It wins over anything below.

## Rules specific to this fork

1. **Never open, search, or grep `bitwarden_license/`.** It is under the Bitwarden License, not the GPL. Exclude it from every search, for example `rg --glob '!**/bitwarden_license/**'`.
2. **Build only the open-source configurations:** `build:oss:*` for web, and `build:chrome`, `build:edge`, `build:firefox` (without `bit`) for the browser extension. Never use a `build:bit:*` script or a webpack config under `bitwarden_license/`.
3. **Branch `keykeeper` is based on release tags, not upstream `main`.** The current base is `web-v2026.8.0`, matching the web vault version `keykeeper-server` supports. Move the base only together with the server.
4. **Branding is applied at build time** by [brand/apply.mjs](brand/apply.mjs) from [brand/brand.json](brand/brand.json). Run `node brand/apply.mjs` before a build and `node brand/apply.mjs --revert` after. Don't hand-edit upstream strings, locales, or logos to rebrand. When upstream changes a file the script patches, the script fails and names the file. Fix the script, not the file.
5. **Upstream agent files:** the guidance upstream ships as `CLAUDE.md` lives here as `AGENTS.md` in the same directories, and its `.claude/rules` live in [docs/agents/rules](docs/agents/rules). When an upstream merge brings back `.claude/` or a `CLAUDE.md`, move or delete it the same way.

## Upstream technical guidance

Still accurate for this codebase:

- [docs/agents/upstream.md](docs/agents/upstream.md): monorepo layout and coding rules.
- [docs/agents/rules](docs/agents/rules): Angular, TypeScript, Tailwind, i18n, testing, and autofill content scripts.
- Per-app notes in `apps/browser/AGENTS.md`, `apps/web/AGENTS.md`, `apps/desktop/AGENTS.md`, `apps/cli/AGENTS.md`, and the auth libraries.

Ignore any upstream instruction about Bitwarden's internal process: Jira tickets, team reviewers, their PR template, or their release flow.

## CI

Upstream's workflows were removed. [.github/workflows/keykeeper-ci.yml](.github/workflows/keykeeper-ci.yml) calls Tier 1 in the meta repo with this commit. When an upstream merge brings workflows back, delete them again.
