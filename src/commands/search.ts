import { MarkdownView, Notice } from 'obsidian';
import type SmartMemoryPlugin from '../main';
import { SEARCH_VIEW_TYPE } from '../views/search-view';
import { ENTITY_VIEW_TYPE } from '../views/entity-view';
import { RecallModal } from '../views/recall-modal';

async function openInRightSidebar(plugin: SmartMemoryPlugin, viewType: string): Promise<void> {
	const { workspace } = plugin.app;
	let leaf = workspace.getLeavesOfType(viewType)[0];
	if (!leaf) {
		const right = workspace.getRightLeaf(false);
		if (!right) {
			new Notice('SmartMemory: cannot open right sidebar');
			return;
		}
		await right.setViewState({ type: viewType, active: true });
		leaf = workspace.getLeavesOfType(viewType)[0];
	}
	workspace.revealLeaf(leaf);
}

export function registerSearchCommands(plugin: SmartMemoryPlugin): void {
	plugin.addCommand({
		id: 'smartmemory-open-search',
		name: 'Open search sidebar',
		callback: () => openInRightSidebar(plugin, SEARCH_VIEW_TYPE),
	});

	plugin.addCommand({
		id: 'smartmemory-open-entities',
		name: 'Open entity backlinks sidebar',
		callback: () => openInRightSidebar(plugin, ENTITY_VIEW_TYPE),
	});

	plugin.addCommand({
		id: 'smartmemory-recall-current-note',
		name: 'Recall related memories for current note',
		hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'r' }],
		callback: () => {
			const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view) {
				new Notice('SmartMemory: no active note');
				return;
			}
			const selection = view.editor.getSelection();
			const query = selection || view.editor.getValue();
			if (!query.trim()) {
				new Notice('SmartMemory: nothing to recall');
				return;
			}
			new RecallModal(plugin.app, plugin, query).open();
		},
	});
}
