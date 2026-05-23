# Tier 2 E2E — Real Obsidian Electron Harness

**Status:** SCAFFOLD ONLY (2026-05-23) — wiring is in place, runner is not.
**Tracked by:** [`DIST-OBSIDIAN-E2E-2`](../../../smart-memory-docs/docs/features/DIST-OBSIDIAN-E2E-1/plan.md#tier-2--deferred-separate-ticket-ifwhen-needed) (slot reserved in the parent feature plan).

## Why this exists separately from `tests/`

Tier 1 (`tests/decisions-panel-e2e.test.ts` + siblings) runs under Vitest+jsdom
and a polyfilled `HTMLElement.prototype`. It catches DOM render correctness,
SDK call shape, lifecycle handling, error paths, cache behavior — about 80%
of the verification value at ~5% of the engineering cost.

Tier 2 catches the remaining 20% — things that depend on Obsidian's actual
runtime: Workspace event timing, MetadataCache eviction, Vault file I/O
ordering, plugin-load-without-console-errors, command-palette registration,
real keypresses against a real sidebar.

## Why scaffold-only (not built)

Real-Obsidian E2E is multi-day work:

1. **Fixture vault** — a committed `fixture-vault/` directory with known notes
   carrying known `smartmemory_id` frontmatter, plus the .obsidian/ config
   that pre-enables the plugin (skip first-run flow). Empty placeholder for
   now in this directory.
2. **Plugin install script** — copies built `main.js` / `manifest.json` /
   `styles.css` into `fixture-vault/.obsidian/plugins/smartmemory/` so the
   test launch sees a pre-installed plugin. One-liner; not built yet.
3. **Electron launcher** — Playwright via `_electron.launch({ executablePath:
   <Obsidian>, args: ['--user-data-dir', <tmp>, fixture-vault] })`. Needs the
   Obsidian binary location resolved per-OS (macOS: `/Applications/Obsidian.
   app/Contents/MacOS/Obsidian`; Linux: AppImage; Windows: %APPDATA%).
4. **Driven scenarios** — open command palette, fire commands, assert sidebar
   contents via accessibility tree. Each scenario ~30 LoC.
5. **CI** — Linux runner with Xvfb; macOS runner against a downloaded
   Obsidian release. Both need network for first-launch resource fetch.

Estimated build effort: **2-3 days** focused work + ongoing flakiness
management. Defer until either (a) Tier 1 misses a class of real bug, or
(b) the community-maintained `obsidian-test` package un-stalls and we can
adopt instead of rolling our own.

## What's actually here right now

- This `README.md` — captures the design + the deferral rationale so a
  future implementer doesn't have to re-derive it.
- `fixture-vault/.gitkeep` — reserves the directory shape that the future
  launcher script will populate.
- `playwright.config.example.ts` — a starter Playwright config aimed at
  Obsidian Electron, comments-only. Becomes the real config when the
  fixture vault + launcher land.

## When to un-defer

Trigger conditions, any of:

1. **Tier 1 missed a real bug.** A production regression that Tier 1 could
   have caught if extended, but couldn't because it requires real Obsidian
   runtime behavior. File the bug, then file Tier 2 implementation against
   it.
2. **Plugin matures past Tier-1 coverage.** When the plugin has 10+ panels
   or commands that interact (e.g., recall hotkey → modal → backend call
   → result render → click-through to vault note), the cross-component
   timing in real Obsidian becomes the dominant failure surface.
3. **Upstream tooling improves.** If `obsidian-test` package gets active
   maintenance, or if Obsidian itself ships a headless mode (currently
   no), Tier 2 cost drops to <1 day and the trade-off flips.
