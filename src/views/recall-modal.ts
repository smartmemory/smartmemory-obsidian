import { App, Modal, MarkdownView, Notice, TFile } from 'obsidian';
import type SmartMemoryPlugin from '../main';
import type { SearchResult } from '../services/search';
import { toWikilinkTarget } from '../util/wikilink-path';

export class RecallModal extends Modal {
	private plugin: SmartMemoryPlugin;
	private query: string;

	constructor(app: App, plugin: SmartMemoryPlugin, query: string) {
		super(app);
		this.plugin = plugin;
		this.query = query;
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('smartmemory-recall-modal');

		contentEl.createEl('h2', { text: 'Recall related memories' });
		const queryPreview = this.query.length > 100 ? this.query.slice(0, 100) + '…' : this.query;
		contentEl.createEl('p', { cls: 'smartmemory-recall-query', text: `Query: ${queryPreview}` });

		const resultsEl = contentEl.createDiv({ cls: 'smartmemory-recall-results' });
		resultsEl.setText('Searching...');

		const search = this.plugin.searchService;
		if (!search) {
			resultsEl.empty();
			resultsEl.setText('SmartMemory not connected.');
			return;
		}

		try {
			const results = await search.search({
				query: this.query,
				topK: 5,
				multiHop: true,
			});
			this.renderResults(resultsEl, results);
		} catch (err) {
			resultsEl.empty();
			resultsEl.setText(`Search failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderResults(container: HTMLElement, results: SearchResult[]): void {
		container.empty();
		if (results.length === 0) {
			container.setText('No related memories found.');
			return;
		}

		for (const result of results) {
			const row = container.createDiv({ cls: 'smartmemory-recall-result' });

			const main = row.createDiv({ cls: 'smartmemory-recall-result-main' });
			const meta = main.createDiv({ cls: 'smartmemory-recall-result-meta' });
			meta.createSpan({ cls: 'smartmemory-search-type', text: result.memoryType });
			if (result.score !== null) {
				meta.createSpan({
					cls: 'smartmemory-search-score',
					text: result.score.toFixed(2),
				});
			}
			main.createDiv({ cls: 'smartmemory-search-snippet', text: result.snippet });

			const actions = row.createDiv({ cls: 'smartmemory-recall-result-actions' });
			const insertBtn = actions.createEl('button', { text: 'Insert link' });
			insertBtn.addEventListener('click', () => {
				this.insertLink(result);
				this.close();
			});

			const openBtn = actions.createEl('button', { text: 'Open' });
			openBtn.addEventListener('click', () => {
				void this.openResult(result);
				this.close();
			});
		}
	}

	private insertLink(result: SearchResult): void {
		const filePath = this.plugin.mappingStore.getFilePath(result.itemId);
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			new Notice('SmartMemory: no active editor');
			return;
		}
		if (!filePath) {
			new Notice('SmartMemory: this memory has no vault note to link to');
			return;
		}
		view.editor.replaceSelection(`[[${toWikilinkTarget(filePath)}]]`);
	}

	private async openResult(result: SearchResult): Promise<void> {
		const filePath = this.plugin.mappingStore.getFilePath(result.itemId);
		if (!filePath) {
			new Notice('SmartMemory: this memory has no vault note');
			return;
		}
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (file instanceof TFile) {
			await this.app.workspace.getLeaf().openFile(file);
		}
	}
}
