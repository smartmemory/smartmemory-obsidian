import { Notice } from 'obsidian';
import type SmartMemoryPlugin from '../main';
import { findEntityMentions, EntityCandidate } from '../bridge/wikilinks';
import { AutolinkModal } from '../views/autolink-modal';
import { readSmartMemoryId } from '../bridge/frontmatter';
import { toWikilinkTarget } from '../util/wikilink-path';

export function registerAutolinkCommand(plugin: SmartMemoryPlugin): void {
	plugin.addCommand({
		id: 'smartmemory-autolink-current-note',
		name: 'Auto-link entities in current note',
		callback: async () => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file) {
				new Notice('SmartMemory: no active note');
				return;
			}
			const client = plugin.client;
			if (!client) {
				new Notice('SmartMemory: not connected');
				return;
			}

			const itemId =
				plugin.mappingStore.getMemoryId(file.path) ??
				readSmartMemoryId(plugin.app, file);
			if (!itemId) {
				new Notice('SmartMemory: this note has not been ingested yet');
				return;
			}

			let entities: any[] = [];
			try {
				const item: any = await client.memories.get(itemId);
				entities = item?.entities || [];
			} catch (err) {
				new Notice(`SmartMemory: failed to fetch entities — ${err instanceof Error ? err.message : err}`);
				return;
			}

			if (entities.length === 0) {
				new Notice('SmartMemory: no entities extracted for this note');
				return;
			}

			const candidates: EntityCandidate[] = [];
			for (const entity of entities) {
				if (!entity?.name) continue;
				const target = plugin.mappingStore.getEntityFile(entity.name);
				if (!target) continue;
				// Don't propose linking to the same note we're editing
				if (target === file.path) continue;
				candidates.push({ name: entity.name, target: toWikilinkTarget(target) });
			}

			if (candidates.length === 0) {
				new Notice('SmartMemory: no entities map to existing vault notes');
				return;
			}

			const text = await plugin.app.vault.read(file);
			const proposals = findEntityMentions(text, candidates);

			new AutolinkModal(plugin.app, file, text, proposals).open();
		},
	});
}
