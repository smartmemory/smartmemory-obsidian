import { Notice, TFile, TFolder } from 'obsidian';
import type SmartMemoryPlugin from '../main';

export function registerIngestCommands(plugin: SmartMemoryPlugin): void {
	plugin.addCommand({
		id: 'smartmemory-ingest-current-note',
		name: 'Ingest current note',
		callback: async () => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file) {
				new Notice('SmartMemory: no active note');
				return;
			}
			if (!plugin.ingestService) {
				new Notice('SmartMemory: not connected');
				return;
			}
			try {
				await plugin.ingestService.ingestFile(file);
				new Notice('SmartMemory: ingested');
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				if (message.includes('quota_exceeded')) {
					new Notice('SmartMemory: free tier limit reached. Upgrade to continue.');
				} else {
					new Notice(`SmartMemory: ingest failed — ${message}`);
				}
			}
		},
	});

	plugin.addCommand({
		id: 'smartmemory-ingest-folder',
		name: 'Ingest folder of current note',
		callback: async () => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file || !file.parent) {
				new Notice('SmartMemory: no folder selected');
				return;
			}
			if (!plugin.ingestService) {
				new Notice('SmartMemory: not connected');
				return;
			}
			const files = collectMarkdownFiles(file.parent);
			if (files.length === 0) {
				new Notice('SmartMemory: no markdown files in folder');
				return;
			}

			new Notice(`SmartMemory: ingesting ${files.length} notes...`);
			const result = await plugin.ingestService.ingestFolder(files);
			new Notice(
				`SmartMemory: ${result.succeeded} ingested, ${result.failed} failed, ${result.skipped} skipped`
			);
		},
	});

	plugin.addCommand({
		id: 'smartmemory-enrich-current-note',
		name: 'Enrich current note',
		callback: async () => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file) {
				new Notice('SmartMemory: no active note');
				return;
			}
			if (!plugin.ingestService) {
				new Notice('SmartMemory: not connected');
				return;
			}
			await plugin.ingestService.enrichFile(file);
		},
	});
}

function collectMarkdownFiles(folder: TFolder): TFile[] {
	const out: TFile[] = [];
	const visit = (f: TFolder) => {
		for (const child of f.children) {
			if (child instanceof TFile && child.extension === 'md') {
				out.push(child);
			} else if (child instanceof TFolder) {
				visit(child);
			}
		}
	};
	visit(folder);
	return out;
}
