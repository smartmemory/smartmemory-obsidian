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
): Promise<void> {
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
}

export function readSmartMemoryId(app: App, file: TFile): string | null {
	const cache = app.metadataCache.getFileCache(file);
	const id = cache?.frontmatter?.smartmemory_id;
	return typeof id === 'string' ? id : null;
}

export async function clearSmartMemoryFrontmatter(app: App, file: TFile): Promise<void> {
	await app.fileManager.processFrontMatter(file, (fm) => {
		for (const key of Object.keys(fm)) {
			if (key.startsWith('smartmemory_')) {
				delete fm[key];
			}
		}
	});
}

function formatEntity(entity: { name: string; type?: string }): string {
	return entity.type ? `${entity.name} (${entity.type})` : entity.name;
}

function formatRelation(rel: { subject?: string; predicate?: string; object?: string } | string): string {
	if (typeof rel === 'string') return rel;
	const parts = [rel.subject, rel.predicate, rel.object].filter(Boolean);
	return parts.join(' → ');
}
