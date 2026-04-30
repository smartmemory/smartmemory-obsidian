import type { App, TFile } from 'obsidian';
import type { SmartMemoryClient } from 'smartmemory-sdk-js/core';
import type { MappingStore } from '../bridge/mapping-store';
import type { SmartMemorySettings } from '../types';
import { writeSmartMemoryFrontmatter, readSmartMemoryId } from '../bridge/frontmatter';

export type IngestEvent =
	| { type: 'ingest-start'; path: string }
	| { type: 'ingest-complete'; path: string; itemId: string }
	| { type: 'ingest-error'; path: string; error: string }
	| { type: 'enrichment-start'; path: string; itemId: string }
	| { type: 'enrichment-complete'; path: string; itemId: string }
	| { type: 'enrichment-timeout'; path: string; itemId: string }
	| { type: 'batch-progress'; processed: number; total: number };

export interface IngestServiceConfig {
	client: SmartMemoryClient;
	app: App;
	mappingStore: MappingStore;
	settings: SmartMemorySettings;
	/** Delay between enrichment poll attempts (ms). Default 3000. */
	pollDelayMs?: number;
	/** Max enrichment poll attempts before timeout. Default 4 (~12s total). */
	pollMaxAttempts?: number;
	/** Max concurrent ingests during folder batch. Default 3. */
	concurrency?: number;
	onEvent?: (event: IngestEvent) => void;
}

export interface BatchResult {
	succeeded: number;
	failed: number;
	skipped: number;
}

export interface IngestFileOptions {
	/** Force PUT update path even if content changed. */
	metadataOnly?: boolean;
	/** Skip auto-enrichment poll after ingest. */
	skipEnrichment?: boolean;
}

/**
 * djb2 hash — fast, deterministic, sufficient for content-change detection.
 * Not cryptographic; we only need to know if a file's content has changed.
 */
export function hashContent(s: string): string {
	let hash = 5381;
	for (let i = 0; i < s.length; i++) {
		hash = ((hash << 5) + hash + s.charCodeAt(i)) | 0;
	}
	return (hash >>> 0).toString(36);
}

export class IngestService {
	private client: SmartMemoryClient;
	private app: App;
	private store: MappingStore;
	private settings: SmartMemorySettings;
	private pollDelayMs: number;
	private pollMaxAttempts: number;
	private concurrency: number;
	private onEvent?: (event: IngestEvent) => void;
	/** When true, file modify events are suppressed (set during folder batch
	 *  to prevent feedback loops with auto-ingest-on-save). */
	public batchInProgress = false;

	constructor(cfg: IngestServiceConfig) {
		this.client = cfg.client;
		this.app = cfg.app;
		this.store = cfg.mappingStore;
		this.settings = cfg.settings;
		this.pollDelayMs = cfg.pollDelayMs ?? 3000;
		this.pollMaxAttempts = cfg.pollMaxAttempts ?? 4;
		this.concurrency = cfg.concurrency ?? 3;
		this.onEvent = cfg.onEvent;
	}

	async ingestFile(file: TFile, options: IngestFileOptions = {}): Promise<{ itemId: string }> {
		this.emit({ type: 'ingest-start', path: file.path });

		try {
			const content = await this.app.vault.read(file);
			const newHash = hashContent(content);
			const oldHash = this.store.getContentHash(file.path);
			const existingId = this.store.getMemoryId(file.path) ?? readSmartMemoryId(this.app, file);

			let itemId: string;
			if (options.metadataOnly && existingId) {
				// Metadata-only: PUT update, skip pipeline re-extraction
				await this.client.memories.update(existingId, {
					metadata: { source_path: file.path },
				});
				itemId = existingId;
			} else if (existingId && oldHash === newHash) {
				// Content unchanged — no-op (avoids redundant pipeline runs)
				this.emit({ type: 'ingest-complete', path: file.path, itemId: existingId });
				return { itemId: existingId };
			} else {
				// First time OR content changed — full pipeline ingest
				const payload: any = {
					content,
					origin: 'import:obsidian',
					metadata: { source_path: file.path },
				};
				if (existingId) {
					payload.metadata.smartmemory_id = existingId;
				}
				const result = await this.client.memories.ingest(payload);
				itemId = result.item_id;
			}

			this.store.set(file.path, itemId);
			this.store.setContentHash(file.path, newHash);

			// Always write the ID + sync timestamp; entities/relations come from enrichFile()
			await writeSmartMemoryFrontmatter(this.app, file, { id: itemId }, this.settings);

			this.emit({ type: 'ingest-complete', path: file.path, itemId });

			if (!options.skipEnrichment) {
				// Fire-and-forget enrichment poll — don't block ingest completion
				void this.enrichFile(file).catch(() => {
					// Errors already surfaced via events
				});
			}

			return { itemId };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.emit({ type: 'ingest-error', path: file.path, error: message });
			throw err;
		}
	}

	/**
	 * Two-step enrichment: poll GET /memory/{itemId} until extracted entities
	 * are available, then write them to the note's frontmatter. Times out
	 * after pollMaxAttempts attempts.
	 */
	async enrichFile(file: TFile): Promise<void> {
		const itemId = this.store.getMemoryId(file.path) ?? readSmartMemoryId(this.app, file);
		if (!itemId) return;

		this.emit({ type: 'enrichment-start', path: file.path, itemId });

		for (let attempt = 0; attempt < this.pollMaxAttempts; attempt++) {
			if (this.pollDelayMs > 0) {
				await sleep(this.pollDelayMs);
			}

			let item: any;
			try {
				item = await this.client.memories.get(itemId);
			} catch {
				continue; // retry on transient error
			}

			if (item?.entities && item.entities.length > 0) {
				await writeSmartMemoryFrontmatter(this.app, file, {
					id: itemId,
					memoryType: item.memory_type,
					entities: item.entities,
					relations: item.relations || [],
				}, this.settings);

				// Cache entity → file mappings for auto-linking later
				for (const entity of item.entities) {
					if (entity?.name) {
						this.store.setEntityFile(entity.name, file.path);
					}
				}

				this.emit({ type: 'enrichment-complete', path: file.path, itemId });
				return;
			}
		}

		this.emit({ type: 'enrichment-timeout', path: file.path, itemId });
	}

	async ingestFolder(files: TFile[]): Promise<BatchResult> {
		this.batchInProgress = true;
		try {
			const queue = files.filter(f => !this.isExcluded(f.path));
			const skipped = files.length - queue.length;
			let succeeded = 0;
			let failed = 0;
			let processed = 0;
			const total = queue.length;

			// Bounded concurrency via worker pool pattern
			const workers: Promise<void>[] = [];
			let nextIndex = 0;

			const runWorker = async (): Promise<void> => {
				while (nextIndex < queue.length) {
					const idx = nextIndex++;
					const file = queue[idx];
					try {
						await this.ingestFile(file, { skipEnrichment: true });
						succeeded++;
					} catch {
						failed++;
					}
					processed++;
					this.emit({ type: 'batch-progress', processed, total });
				}
			};

			for (let i = 0; i < Math.min(this.concurrency, queue.length); i++) {
				workers.push(runWorker());
			}
			await Promise.all(workers);

			return { succeeded, failed, skipped };
		} finally {
			this.batchInProgress = false;
		}
	}

	updateSettings(settings: SmartMemorySettings): void {
		this.settings = settings;
	}

	private isExcluded(path: string): boolean {
		const excludes = this.settings.excludeFolders || [];
		for (const pattern of excludes) {
			// Simple prefix match for folder patterns ending in /
			const normalized = pattern.endsWith('/') ? pattern : pattern + '/';
			if (path.startsWith(normalized) || path.startsWith(pattern)) {
				return true;
			}
		}
		return false;
	}

	private emit(event: IngestEvent): void {
		this.onEvent?.(event);
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}
