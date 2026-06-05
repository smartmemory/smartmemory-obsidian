# Tier 2 E2E — Real Obsidian Electron Harness

**Status:** BUILT (2026-06-05) — drives the real Obsidian binary; 5 specs green locally.
**Tracked by:** [`DIST-OBSIDIAN-E2E-2`](../../../smart-memory-docs/docs/features/DIST-OBSIDIAN-E2E-2/plan.md).

```bash
npm run test:e2e-electron          # all electron specs
# env: OBSIDIAN_BIN=<path>  override the auto-detected binary
#      E2E_VERBOSE=1         log every mock-backend request
#      E2E_SKIP_BUILD=1      skip the plugin rebuild (use existing main.js)
```

## Why this exists separately from `tests/`

Tier 1 (`tests/decisions-panel-e2e.test.ts` + siblings) runs under Vitest+jsdom
and a polyfilled `HTMLElement.prototype`. It catches DOM render correctness,
SDK call shape, lifecycle handling, error paths, cache behavior — about 80%
of the verification value at ~5% of the engineering cost.

Tier 2 catches the remaining 20% — things that depend on Obsidian's actual
runtime: Workspace event timing, plugin-load-without-console-errors,
command-palette registration, real panel reveal in the sidebar, and the
`active-leaf-change` refresh path against the **real** Workspace (not a stub).

## How it boots Obsidian (the hard part)

Obsidian has no `--open-vault` flag and is a hardened packaged app. Two gotchas
shaped this harness:

1. **Playwright's `_electron.launch` does not work.** It attaches to the
   Electron *main* process via the Node inspector (`--inspect`), but Obsidian
   ships with the `EnableNodeCliInspectArguments` Electron fuse disabled, so
   `--inspect` is ignored and the launch never connects. Instead, the fixture
   (`obsidian-app.ts`) **spawns Obsidian with `--remote-debugging-port=0`,
   parses the `DevTools listening on ws://…` endpoint, and
   `chromium.connectOverCDP()`s to the renderer** — driving the window as a
   normal Playwright `Page`.
2. **Obsidian hot-updates its app layer on boot and relaunches**, which severs
   the CDP connection. The seeded `<userData>/obsidian.json` sets
   **`updateDisabled: true`**, pinning the bundled app asar so no update +
   relaunch happens. The per-run userData dir is also wiped first, so a leftover
   downloaded `obsidian-<ver>.asar` can't trigger the two-stage installer→app
   relaunch.

The vault is opened by seeding `<userData>/obsidian.json` with the fixture vault
registered `open: true`. The plugin is pre-installed (`install-plugin.ts`) and
pre-configured via `data.json` (apiUrl → local mock, onboarding completed,
background ingest/sweeps off) written per-run by the fixture.

## Files

| File | Role |
|---|---|
| `obsidian-app.ts` | Playwright fixture: spawn Obsidian, connectOverCDP, expose `{ page, consoleErrors, mockRequests, openNote, runCommand, ... }`. |
| `mock-backend.ts` | ~40-line HTTP mock for the SmartMemory API. Canned data keyed by `provenance_memory_id`. The only network dependency. |
| `install-plugin.ts` | Build + copy `main.js`/`manifest.json`/`styles.css` into the fixture vault. |
| `global-setup.ts` | Runs `install-plugin` once before the suite. |
| `playwright.config.ts` | `testMatch: *.electron.spec.ts`, `workers: 1` (Electron is heavy; serialize). |
| `fixture-vault/` | Committed test vault. Generated plugin binaries under `.obsidian/plugins/` are gitignored. |
| `smoke.electron.spec.ts` | Plugin loads into the vault; zero console errors. |
| `panels.electron.spec.ts` | Commands registered; panel reveals; render + `active-leaf-change` refresh against the real Workspace. |

## Running

Local only, by design — Obsidian has no headless mode, so this is a developer
gate (`npm run test:e2e-electron`) run on a machine with Obsidian installed, not
a CI job. Tier 1 (`npm test`, Vitest/jsdom) remains the fast, CI-friendly tier.
