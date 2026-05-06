# Changelog

All notable changes to the SmartMemory Obsidian plugin are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/).

## [Unreleased]

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
