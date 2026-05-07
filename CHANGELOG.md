# Changelog

All notable changes to the SmartMemory Obsidian plugin are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/).

## [0.2.4] — 2026-05-07 — Hide OriginLegend in graph view

### Changed
- **Pass `showOriginLegend={false}` to `<GraphExplorer>`.** The legend overlay floats above the canvas and crowds the narrow pane Obsidian allocates to plugin views. Origin information is still encoded as the node border color/style (legacy = dashed, derived/system = colored borders), so the signal is preserved on the canvas itself. Web/Studio/Insights still show the legend by default. Existing prop on the shared component — no API change.

## [0.2.3] — 2026-05-07 — Quieter startup diagnostic

### Changed
- **Startup `Notice` only fires on hard blockers.** `surfaceLoadState()` previously toasted on every plugin load with a 10-second summary that mixed connection problems (no API key, no API URL) with user configuration choices (auto-ingest-on-save OFF, workspace auto-discovering). Mixing the two trained users to dismiss the toast, which then hid the genuine "no API key" case when it appeared. The toast now fires only when API key or API URL is missing — the user-fixable blockers — and points to the settings panel. Auto-ingest flags belong in the settings UI / status bar, not in a startup popup.
- **Console log retained.** `console.log('[smartmemory] load state', …)` still runs unconditionally so support can ask users to copy it verbatim. `/smartmemory diagnose` (`main.ts:544`) gives the same on-demand readout for users who can't open devtools. The console payload now includes the bundle version so support tickets always carry it.

## [0.2.2] — 2026-05-07 — Preserve per-type node colors when theming

### Fixed
- **Restore semantic node colors.** 0.2.1 collapsed memory/entity/grounding fills to a single `--graph-node` color, which made the legend (OriginLegend, FilterPanel) misleading — the swatches show per-type colors but the canvas painted everything grey. `resolveTheme()` no longer sets `palette.node`, so the per-type semantic palette is preserved. Edge color, label color, label outline, and selection border still come from Obsidian's CSS variables, so chrome continues to follow the active theme.

### Distribution
- Added `versions.json` entries for 0.2.1 and 0.2.2 so the Obsidian community plugin registry doesn't reject them as missing-version. Note: prior to this round, GitHub Releases were only cut up to 0.1.14 — 0.2.0 + 0.2.1 + 0.2.2 still need releases pushed manually (or via a future workflow) before community-registry users see them.

## [0.2.1] — 2026-05-07 — Obsidian-native graph theming

The embedded `@smartmemory/graph` viewer now matches whatever Obsidian theme the user has loaded — default dark/light, community themes (Minimal, Things, AnuPpuccin), or user CSS snippets.

### Changed
- **Graph canvas reads Obsidian's live CSS variables.** `GraphView.resolveTheme()` resolves `--graph-node`, `--graph-line`, `--graph-text`, `--background-primary`, and `--interactive-accent` via `getComputedStyle(document.body)` and passes them as a `palette` object to `<GraphExplorer theme={...}>` (new prop in `@smartmemory/graph` 0.2.3). This is the same data path Obsidian's own native graph view uses, so theme parity is automatic — no per-theme mapping needed. Plugin re-renders on the workspace `css-change` event, so theme switches and CSS-snippet edits propagate live. Other consumers of the shared package (web, studio, insights) pass no `theme` and are unaffected.
- **Graph chrome adopts Obsidian CSS variables.** New rules in `src/styles.base.css`, scoped under `.smartmemory-graph-view`, redirect Tailwind slate/gray utilities to `--background-primary`/`--background-secondary`/`--text-normal`/`--background-modifier-border` so toolbars, panels, and search controls follow the active Obsidian theme.

## [0.2.0] — 2026-04-30 — DIST-OBSIDIAN-LITE-1: zero-Docker install via smartmemory daemon

The plugin now works end-to-end against `smartmemory daemon` (DIST-DAEMON-1), so users can install with `pip install smartmemory && smartmemory daemon start` — no Docker, no FalkorDB+Redis+Mongo. See [`smart-memory-docs/docs/features/DIST-OBSIDIAN-LITE-1/`](https://github.com/smart-memory/smart-memory-docs/tree/main/docs/features/DIST-OBSIDIAN-LITE-1) for the full design + blueprint + report.

### Added
- **Lite-mode auto-detection.** After every successful connection the plugin probes `GET /health` and reads `mode` + `capabilities`. `runtime.isLite` flips UI affordances. Probe failure preserves last-known mode (a transient daemon hiccup must not flip a known-lite session back to cloud).
- **Cloud / Local radio in onboarding.** First-launch modal asks where data lives. Local path defaults `apiUrl` to `http://127.0.0.1:9014`, hides the API key field, and offers a "Connect to local daemon" button that persists settings before opening the settings tab.
- **Mode dropdown in settings.** Mirror of the onboarding radio. Switching modes rewrites `apiUrl` between hosted and daemon defaults (only when the URL was on the *other* mode's default — custom URLs survive). API key field hidden when lite is selected.
- **"Sync to cloud" affordance.** When `runtime.isLite === true`, the upgrade modal codepath swaps to a new `SyncToCloudModal` pitching backup + cross-device + teams instead of a quota upgrade. Primary action opens `https://app.smartmemory.ai/signup?ref=obsidian-lite`.
- New `src/services/health.ts` with `probeHealth()` + `HealthMode` union. Validates response `mode` against the known union literal so daemon evolutions don't propagate arbitrary strings as a typed `HealthMode`.
- 12 new tests: 9 health-probe tests (lite/cloud/missing-mode/network-failure/non-200/`/memory`-suffix stripping) + 3 quota-errors lite-reroute tests.

### Notes
- This release pairs with daemon changes shipping in the `smart-memory` repo simultaneously: `PATCH /{id}` (new), `DELETE /{id}` (lifted from 405 → 204/404 with vector-store cascade), `POST /ingest` and `POST /search` accept the SDK's contract shapes, `/neighbors` carries `direction` per neighbor, `/health` exposes `mode` + `capabilities`. Older daemons (pre-DIST-OBSIDIAN-LITE-1) report `mode: undefined` and the plugin defaults to cloud behavior — backward compatible.
- "Sync to cloud" only replaces the upgrade modal when the plugin has detected lite mode. If the daemon is unreachable on first connection, the plugin assumes cloud and shows the historical upgrade copy. Re-probe runs on every reconnection.

## [0.1.12] — 2026-04-30 — DIST-OBSIDIAN-1 Phase 7 close-out

### Fixed
- **Quota-error mapping aligned to actual server contract.** Server returns `429` (not `403`) with `detail: "Memory quota exceeded"` and `detail: "Daily query quota exceeded"` for the two cases. The previous handler matched only `status === 403` for memory quota — meaning a free-tier user hitting the ingest cap would have seen "daily limit reached" notice instead of the upgrade modal, silently breaking the distribution funnel. Disambiguates via `detail` string.
- **Re-ingest path no longer duplicates remote items on transient errors.** The existence-check on the unchanged-content path treated any `get()` failure as a 404, deleted the local mapping, and re-ingested — creating duplicate remote items on flaky networks. Now distinguishes 404 (re-ingest) from other statuses (re-throw).
- **Enrichment polling completes for notes with zero extracted entities.** `Array.isArray(entities)` is the terminal signal, not `entities.length > 0`. Notes that legitimately extract zero entities now write back memory_type and sync timestamp instead of timing out.
- **Cleared search query no longer repopulates with stale results.** `requestSeq` advances on the empty-query branch so any in-flight search resolves into the no-op path.
- **Mapping store rename/delete cleans up `entityToFile`.** Renaming or deleting a note used to leave stale entity → file pointers, causing auto-link to propose links to nonexistent or wrong files. Both rename and delete now re-point/prune the entity map.
- **Re-enrichment with shrunken entity sets prunes stale auto-link targets.** New `replaceEntitiesForFile()` operation atomically replaces all entities owned by a file. Without it, an entity that disappears from the extraction would linger forever as an auto-link target.
- **Contradiction banner now direction-aware.** The decision system writes only one canonical edge (`newer -[SUPERSEDES]-> older`); without direction info, opening a *superseded* note showed "This note supersedes another" — exactly inverted. Plugin now reads the new `direction` field on `/neighbors` responses and refuses to render rather than guess if the field is missing.

### Changed
- `Settings → Exclude folders` description now says "path prefixes" (matching the actual prefix-based matcher) instead of misleadingly claiming glob support.

### Added
- 21 new tests pinning the above fixes: `quota-errors.test.ts` (6), `regressions.test.ts` (7), 8 rewritten contradiction tests covering canonical / forward-compat / missing-direction guard. Total: **108 tests passing**, 10 test files.

## [0.1.7] — 2026-04-30

### Fixed
- **Graph pane renders edges again.** Two bugs were silently collapsing the layout into a row/grid arrangement:
  1. `GraphCache.fetch()` now normalizes server field names at the API boundary — server returns `item_id`/`source_id`/`target_id`/`edge_type`; SDK passes them through raw; plugin internals expect `id`/`source`/`target`/`type`. Without normalization every edge's `source`/`target` was `undefined`, BFS produced no adjacency, focus lookup missed, every render path silently degraded.
  2. `GraphView.refresh()` no-focus fallback branch hardcoded `edges: []`. With zero edges the `cose` force layout has no springs to relax against, so 13 nodes laid out top-down. The branch now keeps every edge whose endpoints survived the slice.
- 4 regression tests pin the field-name contract so a future SDK or server rename doesn't silently re-break the graph.

### Changed
- Switched graph pane layout from `cytoscape-cose-bilkent` (registration via `cytoscape.use()` was unreliable under Obsidian's bundled Electron renderer) to Cytoscape's built-in `cose`. No extension means no silent fallback to `grid`. Bundle dropped 600KB → 538KB as a side effect.
- Graph node styling: removed `as cytoscape.StylesheetCSS[]` cast (wrong type — that's for stringified rule sheets). Programmatic style objects now apply correctly: 14px node radius, 10px font, ellipsis label truncation at 120px, dashed edges for extracted relations, solid for `PART_OF`/`SUPERSEDES`.

### Added
- `[smartmemory-graph]` console diagnostics: full-graph response counts, BFS rendered counts, refresh trigger and focus-resolution outcomes. `console.log` (not `console.debug`, which DevTools' default level filter hides).

## [0.1.4] — 2026-04-30

### Added
- `scripts/bump-patch.mjs` + `.husky/pre-commit` — auto-bumps the patch in `package.json`, `manifest.json`, and `versions.json` whenever `src/`, `manifest.json`, or `package.json` is staged. Skip with `SKIP_BUMP=1`. Respects manual bumps (won't second-guess if version already changed). Does not touch `CHANGELOG.md` — that needs human prose.
- Husky added as devDependency; `npm run prepare` installs the hook on a fresh clone.

### Changed
- `SearchService` now dedupes results client-side by `item_id`. The server's RRF merge across hybrid / multi-hop channels can return the same item more than once when it scores in multiple channels; until the server enforces uniqueness, the plugin keeps the first occurrence and drops subsequent dupes.

## [0.1.3] — 2026-04-30

DIST-OBSIDIAN-1 Phase 7 hardening pass. Auto-ingest is now safe to leave on without creating duplicate server-side memories, and the search/entity/graph panes are reachable via the command palette.

### Added
- Command `SmartMemory: Open search pane` — opens the plugin's search view in the right sidebar (previously only registered, never reachable).
- Command `SmartMemory: Open entities pane` — opens the entity backlinks view in the right sidebar.
- Command `SmartMemory: Danger: purge all Obsidian-origin memories from this workspace` — recovery path for users hit by historical feedback loops; deletes every server item with `origin: "import:obsidian*"` and clears `smartmemory_*` frontmatter on every local note.
- Command `SmartMemory: Diagnose ingest loop` — prints memory counts and active-note mapping to console + notice for verifying loop health.
- Search view: result cards now show a title (first non-empty content line, truncated) above the snippet.
- Search view: `stripLeadingYaml()` defensively removes legacy frontmatter blocks from snippet text so historic items render cleanly.
- Frontmatter `smartmemory_relations` now populates from non-`CONTAINS_ENTITY` neighbor edges (`RELATES_TO`, `IS_A`, etc.); previously hard-coded to `[]`.

### Changed
- Entity-name search field is now a query hint (folded into the search query string) rather than a client-side post-filter on `item.entities`. The post-filter never matched in practice because `/memory/search` does not return populated `entities` arrays for graph-extracted items.
- Search view: clearing the query box now bumps the request sequence so any in-flight search resolves into the empty-results branch instead of repopulating the cleared pane.
- Quota error handler disambiguates server `429` responses by the `detail` string. Previously routed memory-quota responses (`"Memory quota exceeded"`) into the daily-rate-limit notice path; they now correctly open the upgrade modal.
- Settings: "Exclude folders" description now reads "path prefixes" (matches the actual matcher) instead of "glob patterns".
- `MappingStore.handleRename` / `handleDelete` now also update `entityToFile` so auto-link does not propose stale wikilinks after a rename or delete.
- `MappingStore.replaceEntitiesForFile()` (new) atomically replaces all entity mappings owned by a given file; used during enrichment to prune entities that disappeared on re-extraction.
- Enrichment poll now treats `Array.isArray(item.entities)` as the terminal signal, including empty arrays. Notes that legitimately extract zero entities now complete instead of polling to timeout.
- Re-ingest existence check distinguishes 404 (true not-found, drop mapping and re-ingest) from transient 5xx (re-throw to caller). Previously any error path treated the remote as gone and silently created a duplicate.

### Workaround
- On content-change ingest, the plugin now deletes the prior server memory before ingesting the new content. **This is a workaround for missing server-side ingest dedupe**; tracked as [`CORE-INGEST-DEDUPE-1`](../smart-memory-docs/docs/features/CORE-INGEST-DEDUPE-1/design.md). Once the server returns `status: unchanged | replaced` from `/memory/ingest`, this client-side dance should be removed.

### Fixed
- **Auto-ingest feedback loop:** an Obsidian save with auto-ingest on no longer creates a duplicate server memory each time. Loop signature: 124 server memories from a single note across a few hours of testing.
- Tests: 13 new regression tests pinning the Codex review fixes (transient-vs-404, empty-array enrichment, entity-mapping prune, etc.).

### Notes
- Bundle size: `main.js` is ~600KB, well above the original plan's 200KB target. Cytoscape + cose-bilkent dominate. Tracked for a future optimization pass.
- Phase 7 step 2 (E2E smoke test in Obsidian dev vault) found four bugs that the unit-test suite missed entirely. Worth a golden-flow harness as a follow-up.

## [0.1.2] — 2026-04-29
Pre-DIST-OBSIDIAN-1-Phase-7. Initial 12-task implementation; details predate this changelog.

## [0.1.1] — 2026-04-29
Initial public scaffold and SDK integration.

## [0.1.0] — 2026-04-29
Project scaffolded.
