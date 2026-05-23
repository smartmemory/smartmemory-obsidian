/**
 * SupersessionsPanel — right-sidebar list of every supersession relationship
 * involving the active note's memory.
 *
 * DIST-OBSIDIAN-PANELS-1 Phase 4.
 *
 * The plugin's existing contradiction banner uses the same data path
 * (`/memory/{id}/neighbors` filtered for SUPERSEDES / SUPERSEDED_BY)
 * but returns only the FIRST finding it encounters. This panel lists
 * ALL relationships, in both directions:
 *   - "this note supersedes …"
 *   - "this note is superseded by …"
 *
 * Naming: kept "supersessions" instead of "contradictions" for accuracy.
 * The banner stays for blocking awareness; the panel is for browsing.
 */
import { TFile, Notice, WorkspaceLeaf } from 'obsidian';
import type SmartMemoryPlugin from '../main';
import { SmartMemoryPanelBase } from './panel-base';

export const SUPERSESSIONS_PANEL_TYPE = 'smartmemory-supersessions';

interface NeighborsResponse {
	neighbors?: Array<{
		item_id: string;
		content?: string;
		link_type?: string;
		direction?: string;
		memory_type?: string;
	}>;
}

interface SupersessionRow {
	kind: 'supersedes' | 'superseded';
	otherItemId: string;
	otherContent: string;
}

export class SupersessionsPanel extends SmartMemoryPanelBase {
	constructor(leaf: WorkspaceLeaf, plugin: SmartMemoryPlugin) {
		super(leaf, plugin);
	}

	getViewType(): string { return SUPERSESSIONS_PANEL_TYPE; }
	getDisplayText(): string { return 'SmartMemory supersessions'; }
	getIcon(): string { return 'arrow-right-circle'; }
	protected rootClass(): string { return 'smartmemory-supersessions-panel'; }

	protected async render(root: HTMLElement, memoryId: string, seq: number): Promise<void> {
		root.createDiv({ cls: 'smartmemory-panel-loading', text: 'Loading…' });

		const client = this.plugin.client!;
		const result = await this.plugin.panelCache.get<NeighborsResponse>(
			memoryId,
			'/neighbors',
			// `as any` dropped 2026-05-23 when shim was corrected to match
			// runtime SDK's getNeighbors; the cast had (luckily) been a no-op
			// here because the method name was already right — but the same
			// pattern in lineage-panel.ts had `lineage` instead of
			// `getLineage` and silently no-op'd in production for 2 weeks
			// (DIST-OBSIDIAN-E2E-1 harness backfill caught it).
			() => client.memories.getNeighbors(memoryId),
		);
		if (seq !== this.refreshSeq) return;

		root.empty();
		root.createEl('h3', { text: this.getDisplayText() });

		const rows = extractSupersessionRows(result?.neighbors || []);
		if (rows.length === 0) {
			this.renderInfo(root, 'No supersession relationships for this memory.');
			return;
		}

		const list = root.createEl('ul', { cls: 'smartmemory-supersessions-list' });
		for (const row of rows) {
			const li = list.createEl('li', { cls: 'smartmemory-supersession-row' });
			li.createSpan({
				cls: row.kind === 'supersedes'
					? 'smartmemory-supersession-supersedes'
					: 'smartmemory-supersession-superseded',
				text: row.kind === 'supersedes' ? 'supersedes' : 'is superseded by',
			});
			const snippet = row.otherContent.length > 100
				? row.otherContent.slice(0, 100) + '…'
				: row.otherContent;
			li.createDiv({ cls: 'smartmemory-supersession-snippet', text: snippet });

			const filePath = this.plugin.mappingStore.getFilePath(row.otherItemId);
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

/**
 * Pure: filter neighbor rows to SUPERSEDES / SUPERSEDED_BY relationships
 * and resolve each to a (kind, otherItemId, otherContent) tuple. Mirrors
 * the asymmetry rules in `services/contradiction.ts checkSupersession`.
 *
 * Rows without a `direction` field are skipped — older servers omit it
 * and we can't safely disambiguate without it.
 */
export function extractSupersessionRows(
	neighbors: Array<{
		item_id?: string;
		content?: string;
		link_type?: string;
		direction?: string;
	}>,
): SupersessionRow[] {
	const out: SupersessionRow[] = [];
	for (const n of neighbors) {
		const linkType = String(n?.link_type || '').toUpperCase();
		const direction = String(n?.direction || '').toLowerCase();
		if (direction !== 'outgoing' && direction !== 'incoming') continue;

		const isSupersedes = linkType === 'SUPERSEDES';
		const isSupersededBy = linkType === 'SUPERSEDED_BY';
		if (!isSupersedes && !isSupersededBy) continue;
		if (!n.item_id) continue;

		const currentSupersedes =
			(isSupersedes && direction === 'outgoing') ||
			(isSupersededBy && direction === 'incoming');
		const currentIsSuperseded =
			(isSupersedes && direction === 'incoming') ||
			(isSupersededBy && direction === 'outgoing');

		if (currentSupersedes) {
			out.push({
				kind: 'supersedes',
				otherItemId: n.item_id,
				otherContent: typeof n.content === 'string' ? n.content : '',
			});
		} else if (currentIsSuperseded) {
			out.push({
				kind: 'superseded',
				otherItemId: n.item_id,
				otherContent: typeof n.content === 'string' ? n.content : '',
			});
		}
	}
	return out;
}
