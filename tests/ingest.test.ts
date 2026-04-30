import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IngestService, hashContent, IngestEvent } from '../src/services/ingest';
import { MappingStore } from '../src/bridge/mapping-store';
import { EMPTY_MAPPINGS, DEFAULT_SETTINGS } from '../src/types';

function createMockClient() {
	return {
		memories: {
			ingest: vi.fn().mockResolvedValue({ item_id: 'item-new' }),
			update: vi.fn().mockResolvedValue({ status: 'success' }),
			get: vi.fn().mockResolvedValue({
				item_id: 'item-new',
				memory_type: 'semantic',
				entities: [{ name: 'Asimov', type: 'Person' }],
				relations: [],
			}),
		},
	};
}

function createMockApp() {
	const frontmatters: Record<string, any> = {};
	return {
		fileManager: {
			processFrontMatter: vi.fn(async (file: any, fn: (fm: any) => void) => {
				const fm = frontmatters[file.path] ?? {};
				fn(fm);
				frontmatters[file.path] = fm;
			}),
		},
		metadataCache: {
			getFileCache: vi.fn((file: any) => ({ frontmatter: frontmatters[file.path] ?? {} })),
		},
		vault: {
			read: vi.fn(async (file: any) => file._content ?? ''),
		},
		_frontmatters: frontmatters,
	};
}

describe('hashContent', () => {
	it('produces stable hashes for identical input', () => {
		expect(hashContent('hello world')).toBe(hashContent('hello world'));
	});

	it('produces different hashes for different input', () => {
		expect(hashContent('a')).not.toBe(hashContent('b'));
	});

	it('handles empty string', () => {
		expect(hashContent('')).toBeTruthy();
	});
});

describe('IngestService.ingestFile', () => {
	let service: IngestService;
	let client: any;
	let app: any;
	let store: MappingStore;
	let events: IngestEvent[];

	beforeEach(() => {
		client = createMockClient();
		app = createMockApp();
		store = new MappingStore({ ...EMPTY_MAPPINGS });
		events = [];
		service = new IngestService({
			client,
			app,
			mappingStore: store,
			settings: DEFAULT_SETTINGS,
			pollDelayMs: 0,           // disable real timers in tests
			pollMaxAttempts: 3,
			onEvent: (e) => events.push(e),
		});
	});

	describe('first-time ingest', () => {
		it('POSTs ingest with origin import:obsidian and writes mapping', async () => {
			const file = { path: 'notes/asimov.md', _content: 'About Asimov' };
			const result = await service.ingestFile(file as any);

			expect(client.memories.ingest).toHaveBeenCalledWith(expect.objectContaining({
				content: 'About Asimov',
				origin: 'import:obsidian',
			}));
			expect(result.itemId).toBe('item-new');
			expect(store.getMemoryId('notes/asimov.md')).toBe('item-new');
			expect(app._frontmatters['notes/asimov.md'].smartmemory_id).toBe('item-new');
		});

		it('writes content hash so re-ingest can detect changes', async () => {
			const file = { path: 'a.md', _content: 'hello' };
			await service.ingestFile(file as any);
			expect(store.getContentHash('a.md')).toBe(hashContent('hello'));
		});
	});

	describe('re-ingest path selection', () => {
		it('uses POST /ingest when content changed', async () => {
			const file = { path: 'a.md', _content: 'original' };
			await service.ingestFile(file as any);
			client.memories.ingest.mockClear();

			file._content = 'modified content';
			await service.ingestFile(file as any);

			expect(client.memories.ingest).toHaveBeenCalled();
			expect(client.memories.update).not.toHaveBeenCalled();
		});

		it('uses PUT /update when only metadata changed (content hash unchanged)', async () => {
			const file = { path: 'a.md', _content: 'same' };
			await service.ingestFile(file as any);
			client.memories.ingest.mockClear();

			// Same content, just calling re-ingest
			await service.ingestFile(file as any, { metadataOnly: true });

			expect(client.memories.ingest).not.toHaveBeenCalled();
			expect(client.memories.update).toHaveBeenCalled();
		});
	});

	describe('enrichment polling', () => {
		it('writes entities + relations to frontmatter when extraction succeeds', async () => {
			const file = { path: 'a.md', _content: 'hi' };
			await service.ingestFile(file as any, { skipEnrichment: true });
			await service.enrichFile(file as any);

			expect(app._frontmatters['a.md'].smartmemory_entities).toEqual(['Asimov (Person)']);
			expect(app._frontmatters['a.md'].smartmemory_type).toBe('semantic');
		});

		it('retries when entities are not yet ready', async () => {
			const file = { path: 'a.md', _content: 'hi' };
			await service.ingestFile(file as any, { skipEnrichment: true });
			client.memories.get.mockClear();

			let callCount = 0;
			client.memories.get.mockImplementation(async () => {
				callCount++;
				if (callCount < 2) {
					return { item_id: 'item-new', entities: null };
				}
				return { item_id: 'item-new', entities: [{ name: 'X', type: 'Y' }], memory_type: 'semantic' };
			});

			await service.enrichFile(file as any);
			expect(callCount).toBe(2);
			expect(app._frontmatters['a.md'].smartmemory_entities).toEqual(['X (Y)']);
		});

		it('gives up after pollMaxAttempts and emits timeout event', async () => {
			const file = { path: 'a.md', _content: 'hi' };
			await service.ingestFile(file as any, { skipEnrichment: true });
			client.memories.get.mockClear();
			client.memories.get.mockResolvedValue({ item_id: 'item-new', entities: null });
			events.length = 0;

			await service.enrichFile(file as any);

			const timeoutEvent = events.find(e => e.type === 'enrichment-timeout');
			expect(timeoutEvent).toBeDefined();
			expect(client.memories.get).toHaveBeenCalledTimes(3);
		});
	});

	describe('event emission', () => {
		it('emits ingest-start and ingest-complete', async () => {
			const file = { path: 'a.md', _content: 'hi' };
			await service.ingestFile(file as any);

			expect(events.map(e => e.type)).toContain('ingest-start');
			expect(events.map(e => e.type)).toContain('ingest-complete');
		});
	});
});

describe('IngestService.ingestFolder', () => {
	let service: IngestService;
	let client: any;
	let app: any;
	let store: MappingStore;

	beforeEach(() => {
		client = createMockClient();
		app = createMockApp();
		store = new MappingStore({ ...EMPTY_MAPPINGS });
		service = new IngestService({
			client,
			app,
			mappingStore: store,
			settings: DEFAULT_SETTINGS,
			pollDelayMs: 0,
			pollMaxAttempts: 1,
			concurrency: 2,
		});
	});

	it('processes all files in batch', async () => {
		let counter = 0;
		client.memories.ingest.mockImplementation(async () => ({ item_id: `item-${counter++}` }));

		const files = [
			{ path: 'a.md', _content: 'a' },
			{ path: 'b.md', _content: 'b' },
			{ path: 'c.md', _content: 'c' },
		];

		const result = await service.ingestFolder(files as any);
		expect(result.succeeded).toBe(3);
		expect(result.failed).toBe(0);
		expect(client.memories.ingest).toHaveBeenCalledTimes(3);
	});

	it('skips files matching excluded folder patterns', async () => {
		const files = [
			{ path: 'notes/keep.md', _content: 'k' },
			{ path: 'templates/skip.md', _content: 's' },
		];

		const result = await service.ingestFolder(files as any);
		expect(result.succeeded).toBe(1);
		expect(result.skipped).toBe(1);
	});

	it('reports per-file failures without aborting batch', async () => {
		let callCount = 0;
		client.memories.ingest.mockImplementation(async () => {
			callCount++;
			if (callCount === 2) throw new Error('boom');
			return { item_id: `item-${callCount}` };
		});

		const files = [
			{ path: 'a.md', _content: 'a' },
			{ path: 'b.md', _content: 'b' },
			{ path: 'c.md', _content: 'c' },
		];

		const result = await service.ingestFolder(files as any);
		expect(result.succeeded).toBe(2);
		expect(result.failed).toBe(1);
	});
});
