import { MarkdownView, Notice } from 'obsidian';
import type SmartMemoryPlugin from '../main';
import { SEARCH_VIEW_TYPE } from '../views/search-view';
import { RecallModal } from '../views/recall-modal';

export function registerSearchCommands(plugin: SmartMemoryPlugin): void {
	plugin.addCommand({
		id: 'smartmemory-open-search',
		name: 'Open search sidebar',
		callback: async () => {
			const { workspace } = plugin.app;
			let leaf = workspace.getLeavesOfType(SEARCH_VIEW_TYPE)[0];
			if (!leaf) {
				const right = workspace.getRightLeaf(false);
				if (!right) {
					new Notice('SmartMemory: cannot open right sidebar');
					return;
				}
				await right.setViewState({ type: SEARCH_VIEW_TYPE, active: true });
				leaf = workspace.getLeavesOfType(SEARCH_VIEW_TYPE)[0];
			}
			workspace.revealLeaf(leaf);
		},
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
