import { ItemView, WorkspaceLeaf, Notice, TFile } from 'obsidian';
import type SmartMemoryPlugin from '../main';
import type { SearchResult } from '../services/search';

export const SEARCH_VIEW_TYPE = 'smartmemory-search';

export class SearchView extends ItemView {
	private plugin: SmartMemoryPlugin;
	private inputEl: HTMLInputElement | null = null;
	private resultsEl: HTMLElement | null = null;
	private memoryTypeEl: HTMLSelectElement | null = null;
	private originEl: HTMLInputElement | null = null;
	private entityEl: HTMLInputElement | null = null;
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private requestSeq = 0;

	constructor(leaf: WorkspaceLeaf, plugin: SmartMemoryPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string { return SEARCH_VIEW_TYPE; }
	getDisplayText(): string { return 'SmartMemory search'; }
	getIcon(): string { return 'search'; }

	async onOpen(): Promise<void> {
		const root = this.containerEl.children[1] as HTMLElement;
		root.empty();
		root.addClass('smartmemory-search-view');

		const header = root.createDiv({ cls: 'smartmemory-search-header' });
		header.createEl('h3', { text: 'SmartMemory' });

		const inputWrap = root.createDiv({ cls: 'smartmemory-search-input-wrap' });
		this.inputEl = inputWrap.createEl('input', {
			type: 'text',
			placeholder: 'Search your memory...',
			cls: 'smartmemory-search-input',
		});
		this.inputEl.addEventListener('input', () => this.onQueryChange());

		const filtersEl = root.createDiv({ cls: 'smartmemory-search-filters' });

		this.memoryTypeEl = filtersEl.createEl('select', { cls: 'smartmemory-search-filter' });
		for (const opt of ['', 'semantic', 'episodic', 'procedural', 'pending', 'zettel', 'decision']) {
			this.memoryTypeEl.createEl('option', { value: opt, text: opt || 'All types' });
		}
		this.memoryTypeEl.addEventListener('change', () => this.onQueryChange());

		this.originEl = filtersEl.createEl('input', {
			type: 'text',
			placeholder: 'Origin prefix (e.g. import:)',
			cls: 'smartmemory-search-filter',
		});
		this.originEl.addEventListener('input', () => this.onQueryChange());

		this.entityEl = filtersEl.createEl('input', {
			type: 'text',
			placeholder: 'Entity name',
			cls: 'smartmemory-search-filter',
		});
		this.entityEl.addEventListener('input', () => this.onQueryChange());

		this.resultsEl = root.createDiv({ cls: 'smartmemory-search-results' });
	}

	async onClose(): Promise<void> {
		if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
	}

	private onQueryChange(): void {
		if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
		this.debounceTimer = setTimeout(() => {
			void this.runSearch();
		}, 300);
	}

	private async runSearch(): Promise<void> {
		const query = this.inputEl?.value?.trim() ?? '';
		if (!query) {
			this.renderResults([]);
			return;
		}

		const search = this.plugin.searchService;
		if (!search) {
			this.renderError('Not connected. Configure API key in settings.');
			return;
		}

		const seq = ++this.requestSeq;
		try {
			const results = await search.search({
				query,
				topK: 10,
				multiHop: true,
				memoryType: this.memoryTypeEl?.value || undefined,
				originPrefix: this.originEl?.value || undefined,
				entity: this.entityEl?.value || undefined,
			});
			// Discard stale results
			if (seq !== this.requestSeq) return;
			this.renderResults(results);
		} catch (err) {
			if (seq !== this.requestSeq) return;
			const message = err instanceof Error ? err.message : String(err);
			if (message.includes('429')) {
				this.renderError('Daily search limit reached. Upgrade to continue.');
			} else {
				this.renderError(`Search failed: ${message}`);
			}
		}
	}

	private renderResults(results: SearchResult[]): void {
		const el = this.resultsEl;
		if (!el) return;
		el.empty();

		if (results.length === 0) {
			el.createDiv({ cls: 'smartmemory-search-empty', text: 'No results' });
			return;
		}

		for (const result of results) {
			const card = el.createDiv({ cls: 'smartmemory-search-result' });

			const header = card.createDiv({ cls: 'smartmemory-search-result-header' });
			header.createSpan({ cls: 'smartmemory-search-type', text: result.memoryType });
			if (result.score !== null) {
				header.createSpan({
					cls: 'smartmemory-search-score',
					text: result.score.toFixed(2),
				});
			}

			card.createDiv({ cls: 'smartmemory-search-snippet', text: result.snippet });

			card.addEventListener('click', () => this.onResultClick(result));
		}
	}

	private renderError(msg: string): void {
		this.resultsEl?.empty();
		this.resultsEl?.createDiv({ cls: 'smartmemory-search-error', text: msg });
	}

	private async onResultClick(result: SearchResult): Promise<void> {
		const filePath = this.plugin.mappingStore.getFilePath(result.itemId);
		if (filePath) {
			const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TFile) {
				await this.plugin.app.workspace.getLeaf().openFile(file);
				return;
			}
		}
		new Notice('SmartMemory: this memory has no vault note. Future feature: create one.');
	}
}
