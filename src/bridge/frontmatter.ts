import type { App, TFile } from 'obsidian';
import type { SmartMemorySettings } from '../types';

export interface EnrichmentData {
	id: string;
	memoryType?: string;
	entities?: Array<{ name: string; type?: string }>;
	relations?: Array<{ subject?: string; predicate?: string; object?: string } | string>;
}

/**
 * Write SmartMemory enrichment fields to a note's YAML frontmatter.
 *
 * All fields are prefixed `smartmemory_` to avoid collision with user fields.
 * Per-field toggles in settings control which fields are written.
 *
 * Uses Obsidian's processFrontMatter() to safely round-trip YAML without
 * corrupting existing fields or content.
 */
export async function writeSmartMemoryFrontmatter(
	app: App,
	file: TFile,
	data: EnrichmentData,
	settings: SmartMemorySettings,
): Promise<{ ok: true } | { ok: false; error: Error }> {
	try {
		await app.fileManager.processFrontMatter(file, (fm) => {
			if (settings.writeFrontmatterId) {
				fm.smartmemory_id = data.id;
			}
			if (settings.enrichMemoryType && data.memoryType) {
				fm.smartmemory_type = data.memoryType;
			}
			if (settings.enrichEntities && data.entities) {
				fm.smartmemory_entities = data.entities.map(formatEntity);
			}
			if (settings.enrichRelations && data.relations) {
				fm.smartmemory_relations = data.relations.map(formatRelation);
			}
			if (settings.enrichSyncTimestamp) {
				fm.smartmemory_last_sync = new Date().toISOString();
			}
		});
		return { ok: true };
	} catch (err) {
		// Malformed YAML or unparseable frontmatter — surface to caller for
		// graceful handling (e.g., notice the user, log, skip enrichment)
		return { ok: false, error: err instanceof Error ? err : new Error(String(err)) };
	}
}

export function readSmartMemoryId(app: App, file: TFile): string | null {
	const cache = app.metadataCache.getFileCache(file);
	const id = cache?.frontmatter?.smartmemory_id;
	return typeof id === 'string' ? id : null;
}

export async function clearSmartMemoryFrontmatter(
	app: App,
	file: TFile,
): Promise<{ ok: true } | { ok: false; error: Error }> {
	try {
		await app.fileManager.processFrontMatter(file, (fm) => {
			for (const key of Object.keys(fm)) {
				if (key.startsWith('smartmemory_')) {
					delete fm[key];
				}
			}
		});
		return { ok: true };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err : new Error(String(err)) };
	}
}

function formatEntity(entity: { name: string; type?: string }): string {
	return entity.type ? `${entity.name} (${entity.type})` : entity.name;
}

function formatRelation(rel: { subject?: string; predicate?: string; object?: string } | string): string {
	if (typeof rel === 'string') return rel;
	const parts = [rel.subject, rel.predicate, rel.object].filter(Boolean);
	return parts.join(' → ');
}

/**
 * Strip a leading YAML frontmatter block (---\nYAML\n---\n) from raw content.
 *
 * We strip before hashing AND before sending to ingest so:
 *   1. Our own frontmatter writes (smartmemory_id, last_sync) do NOT change
 *      the body hash, breaking the auto-ingest feedback loop where each
 *      writeback fires another modify event that fires another ingest.
 *   2. The entity extractor only sees the user's actual prose — without
 *      this, fields like `smartmemory_id` get extracted as entities and
 *      pollute the graph.
 *
 * If no frontmatter is present, returns the original string unchanged.
 */
export function stripFrontmatter(raw: string): string {
	if (!raw.startsWith('---')) return raw;
	const match = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
	if (!match) return raw;
	return raw.slice(match[0].length);
}
