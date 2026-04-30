import { ItemView, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import type SmartMemoryPlugin from '../main';
import { readSmartMemoryId } from '../bridge/frontmatter';

export const ENTITY_VIEW_TYPE = 'smartmemory-entities';

export class EntityView extends ItemView {
	private plugin: SmartMemoryPlugin;
	private rootEl: HTMLElement | null = null;
	private currentFile: TFile | null = null;
	/** Increments on every refresh; in-flight fetches whose seq doesn't match
	 *  are discarded to prevent stale renders from rapid leaf changes. */
	private refreshSeq = 0;

	constructor(leaf: WorkspaceLeaf, plugin: SmartMemoryPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string { return ENTITY_VIEW_TYPE; }
	getDisplayText(): string { return 'SmartMemory entities'; }
	getIcon(): string { return 'tag'; }

	async onOpen(): Promise<void> {
		this.rootEl = this.containerEl.children[1] as HTMLElement;
		this.rootEl.empty();
		this.rootEl.addClass('smartmemory-entity-view');
		await this.refresh();
	}

	async refresh(file?: TFile | null): Promise<void> {
		const root = this.rootEl;
		if (!root) return;
		const seq = ++this.refreshSeq;
		root.empty();

		const target = file ?? this.plugin.app.workspace.getActiveFile();
		this.currentFile = target ?? null;

		root.createEl('h3', { text: 'Entities in this note' });

		if (!target) {
			root.createDiv({ cls: 'smartmemory-entity-empty', text: 'No active note.' });
			return;
		}

		const itemId =
			this.plugin.mappingStore.getMemoryId(target.path) ??
			readSmartMemoryId(this.plugin.app, target);

		if (!itemId) {
			root.createDiv({
				cls: 'smartmemory-entity-empty',
				text: 'This note has not been ingested. Run "SmartMemory: Ingest current note".',
			});
			return;
		}

		const client = this.plugin.client;
		if (!client) {
			root.createDiv({ cls: 'smartmemory-entity-empty', text: 'Not connected.' });
			return;
		}

		try {
			const item: any = await client.memories.get(itemId);
			// Discard if a newer refresh has started during the await
			if (seq !== this.refreshSeq) return;

			const entities: Array<{ name: string; type?: string }> = item?.entities || [];

			if (entities.length === 0) {
				root.createDiv({
					cls: 'smartmemory-entity-empty',
					text: 'No entities extracted yet. Run "SmartMemory: Enrich current note".',
				});
				return;
			}

			const chips = root.createDiv({ cls: 'smartmemory-entity-chips' });
			for (const entity of entities) {
				if (!entity?.name) continue;
				const chip = chips.createDiv({ cls: 'smartmemory-entity-chip' });
				chip.createSpan({ cls: 'smartmemory-entity-name', text: entity.name });
				if (entity.type) {
					chip.createSpan({ cls: 'smartmemory-entity-type', text: entity.type });
				}
				chip.addEventListener('click', () => this.showCrossNoteResults(entity.name, root));
			}
		} catch (err) {
			if (seq !== this.refreshSeq) return;
			root.createDiv({
				cls: 'smartmemory-entity-empty',
				text: `Failed to load entities: ${err instanceof Error ? err.message : String(err)}`,
			});
		}
	}

	private async showCrossNoteResults(entityName: string, root: HTMLElement): Promise<void> {
		// Remove any previous cross-note results section
		root.querySelectorAll('.smartmemory-entity-cross-results').forEach(el => el.remove());

		const section = root.createDiv({ cls: 'smartmemory-entity-cross-results' });
		section.createEl('h4', { text: `Notes mentioning "${entityName}"` });

		const search = this.plugin.searchService;
		if (!search) {
			section.createDiv({ text: 'Not connected.' });
			return;
		}

		try {
			const results = await search.search({
				query: entityName,
				topK: 10,
				entity: entityName,
			});

			if (results.length === 0) {
				section.createDiv({ text: 'No other notes mention this entity.' });
				return;
			}

			for (const result of results) {
				const row = section.createDiv({ cls: 'smartmemory-entity-cross-result' });
				const filePath = this.plugin.mappingStore.getFilePath(result.itemId);
				const label = filePath || result.snippet.slice(0, 60);
				const link = row.createEl('a', { text: label });
				link.addEventListener('click', async () => {
					if (filePath) {
						const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
						if (file instanceof TFile) {
							await this.plugin.app.workspace.getLeaf().openFile(file);
						}
					} else {
						new Notice('SmartMemory: this memory has no vault note.');
					}
				});
			}
		} catch (err) {
			section.createDiv({ text: `Search failed: ${err instanceof Error ? err.message : String(err)}` });
		}
	}
}
