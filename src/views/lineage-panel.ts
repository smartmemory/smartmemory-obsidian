/**
 * LineagePanel — right-sidebar view of a memory's derivation chain.
 *
 * DIST-OBSIDIAN-PANELS-1 Phase 3.
 *
 * Reads `client.memories.lineage(itemId)` (same path as `LineageModal`)
 * and renders the chain as a vertical timeline that updates as the user
 * navigates between notes. The modal is preserved for deep-dive use; the
 * panel is the ambient version that follows the active leaf.
 *
 * Data shape (matches lineage-modal.ts):
 *   {
 *     lineage: Array<{
 *       item_id: string;
 *       memory_type?: string;
 *       confidence?: number;
 *       content?: string;
 *     }>;
 *     depth?: number;
 *   }
 */
import { TFile, Notice, WorkspaceLeaf } from 'obsidian';
import type SmartMemoryPlugin from '../main';
import { SmartMemoryPanelBase } from './panel-base';

export const LINEAGE_PANEL_TYPE = 'smartmemory-lineage';

interface LineageItem {
	item_id: string;
	memory_type?: string;
	confidence?: number;
	content?: string;
}

interface LineageResponse {
	lineage?: LineageItem[];
	depth?: number;
}

export class LineagePanel extends SmartMemoryPanelBase {
	constructor(leaf: WorkspaceLeaf, plugin: SmartMemoryPlugin) {
		super(leaf, plugin);
	}

	getViewType(): string { return LINEAGE_PANEL_TYPE; }
	getDisplayText(): string { return 'SmartMemory lineage'; }
	getIcon(): string { return 'git-branch'; }
	protected rootClass(): string { return 'smartmemory-lineage-panel'; }

	protected async render(root: HTMLElement, memoryId: string, seq: number): Promise<void> {
		root.createDiv({ cls: 'smartmemory-panel-loading', text: 'Loading…' });

		const client = this.plugin.client!;
		const result = await this.plugin.panelCache.get<LineageResponse>(
			memoryId,
			'/lineage',
			() => (client.memories as any).lineage(memoryId),
		);
		if (seq !== this.refreshSeq) return;

		// Reset after the loading placeholder
		root.empty();
		root.createEl('h3', { text: this.getDisplayText() });

		const chain = Array.isArray(result?.lineage) ? result.lineage : [];
		if (chain.length === 0) {
			this.renderInfo(
				root,
				'No derivation history. This memory has not been processed by enrichers yet.',
			);
			return;
		}

		root.createEl('p', {
			cls: 'smartmemory-lineage-info',
			text: `${chain.length} item${chain.length === 1 ? '' : 's'} in derivation chain` +
				(typeof result.depth === 'number' ? ` (depth ${result.depth}).` : '.'),
		});

		const list = root.createEl('ol', { cls: 'smartmemory-lineage-list' });
		for (const item of chain) {
			const li = list.createEl('li');
			const meta = li.createDiv({ cls: 'smartmemory-lineage-meta' });
			meta.createSpan({
				cls: 'smartmemory-search-type',
				text: item.memory_type || 'unknown',
			});
			if (typeof item.confidence === 'number') {
				meta.createSpan({
					cls: 'smartmemory-lineage-confidence',
					text: `conf ${item.confidence.toFixed(2)}`,
				});
			}
			if (item.content) {
				li.createDiv({ cls: 'smartmemory-search-snippet', text: item.content });
			}

			const filePath = this.plugin.mappingStore.getFilePath(item.item_id);
			if (filePath) {
				const link = li.createEl('a', { text: 'Open vault note', href: '#' });
				link.addEventListener('click', async (e) => {
					e.preventDefault();
					const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
					if (file instanceof TFile) {
						await this.plugin.app.workspace.getLeaf().openFile(file);
					} else {
						new Notice('SmartMemory: vault note no longer exists');
					}
				});
			}
		}
	}
}
