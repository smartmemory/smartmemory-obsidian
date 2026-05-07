/**
 * DIST-OBSIDIAN-PANELS-1 Phase 1: master frontmatter-toggle migration.
 *
 * Tests the decision rule directly. The migration method itself lives on
 * SmartMemoryPlugin and is awkward to instantiate in isolation, so this
 * file exercises a free-function port of the same rule. Both paths must
 * stay in sync — see main.ts `migrateFrontmatterToggle`.
 */
import { describe, it, expect } from 'vitest';

interface MigrationInputs {
	prior: Record<string, unknown>;
	vaultHasEnrichment: boolean;
}

/** Mirrors `SmartMemoryPlugin.migrateFrontmatterToggle` decision tree. */
function decideMaster({ prior, vaultHasEnrichment }: MigrationInputs): boolean {
	const priorOptIn =
		prior.enrichEntities === true ||
		prior.enrichRelations === true ||
		prior.enrichMemoryType === true ||
		prior.enrichSyncTimestamp === true;
	if (priorOptIn) return true;
	return vaultHasEnrichment;
}

describe('writeFrontmatterEnrichment migration', () => {
	it('preserves user opt-in when any prior enrich* flag was true', () => {
		// User explicitly enabled entity writes in 0.2.x — keep that ON
		// even if their vault happens to have no enrichment yet.
		expect(
			decideMaster({
				prior: { enrichEntities: true, enrichRelations: false },
				vaultHasEnrichment: false,
			}),
		).toBe(true);
	});

	it('honors vault state when prior settings are all default-false', () => {
		// User upgraded; their vault has Dataview-driven dashboards.
		// Migrate ON to keep them working.
		expect(
			decideMaster({
				prior: {
					enrichEntities: false,
					enrichRelations: false,
					enrichMemoryType: false,
					enrichSyncTimestamp: false,
				},
				vaultHasEnrichment: true,
			}),
		).toBe(true);
	});

	it('defaults OFF for fresh installs (no prior settings, empty vault)', () => {
		// New install — no Dataview to break, prefer clean YAML.
		expect(decideMaster({ prior: {}, vaultHasEnrichment: false })).toBe(false);
	});

	it('defaults OFF when user explicitly opted out and vault has no enrichment', () => {
		// User in 0.2.x turned everything off; no vault data either.
		expect(
			decideMaster({
				prior: {
					enrichEntities: false,
					enrichRelations: false,
					enrichMemoryType: false,
					enrichSyncTimestamp: false,
				},
				vaultHasEnrichment: false,
			}),
		).toBe(false);
	});

	it('opt-in dominates vault-empty', () => {
		// User had at least one enrich* flag ON but no notes have been
		// ingested yet. Honor intent; vault state is irrelevant.
		expect(
			decideMaster({
				prior: { enrichSyncTimestamp: true },
				vaultHasEnrichment: false,
			}),
		).toBe(true);
	});
});
