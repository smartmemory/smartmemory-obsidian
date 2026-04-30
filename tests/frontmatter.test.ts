import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	writeSmartMemoryFrontmatter,
	readSmartMemoryId,
	clearSmartMemoryFrontmatter,
} from '../src/bridge/frontmatter';
import { DEFAULT_SETTINGS } from '../src/types';

describe('frontmatter helpers', () => {
	let mockApp: any;
	let mockFile: any;
	let frontmatter: Record<string, any>;

	beforeEach(() => {
		frontmatter = {};
		mockFile = { path: 'test.md' };
		mockApp = {
			fileManager: {
				processFrontMatter: vi.fn(async (_file: any, fn: (fm: any) => void) => {
					fn(frontmatter);
				}),
			},
			metadataCache: {
				getFileCache: vi.fn(() => ({ frontmatter })),
			},
		};
	});

	describe('writeSmartMemoryFrontmatter', () => {
		it('writes smartmemory_id when writeFrontmatterId is true', async () => {
			await writeSmartMemoryFrontmatter(mockApp, mockFile, {
				id: 'item-abc',
			}, DEFAULT_SETTINGS);

			expect(frontmatter.smartmemory_id).toBe('item-abc');
		});

		it('skips smartmemory_id when writeFrontmatterId is false', async () => {
			const settings = { ...DEFAULT_SETTINGS, writeFrontmatterId: false };
			await writeSmartMemoryFrontmatter(mockApp, mockFile, {
				id: 'item-abc',
			}, settings);

			expect(frontmatter.smartmemory_id).toBeUndefined();
		});

		it('writes entities only when enrichEntities is true', async () => {
			await writeSmartMemoryFrontmatter(mockApp, mockFile, {
				id: 'item-1',
				entities: [{ name: 'Asimov', type: 'Person' }],
			}, DEFAULT_SETTINGS);

			expect(frontmatter.smartmemory_entities).toEqual(['Asimov (Person)']);
		});

		it('skips entities when enrichEntities is false', async () => {
			const settings = { ...DEFAULT_SETTINGS, enrichEntities: false };
			await writeSmartMemoryFrontmatter(mockApp, mockFile, {
				id: 'item-1',
				entities: [{ name: 'Asimov', type: 'Person' }],
			}, settings);

			expect(frontmatter.smartmemory_entities).toBeUndefined();
		});

		it('writes memory_type when enabled', async () => {
			await writeSmartMemoryFrontmatter(mockApp, mockFile, {
				id: 'item-1',
				memoryType: 'semantic',
			}, DEFAULT_SETTINGS);

			expect(frontmatter.smartmemory_type).toBe('semantic');
		});

		it('writes sync timestamp when enabled', async () => {
			const before = Date.now();
			await writeSmartMemoryFrontmatter(mockApp, mockFile, {
				id: 'item-1',
			}, DEFAULT_SETTINGS);

			expect(frontmatter.smartmemory_last_sync).toBeDefined();
			const ts = new Date(frontmatter.smartmemory_last_sync).getTime();
			expect(ts).toBeGreaterThanOrEqual(before);
		});

		it('all smartmemory_ fields use prefix isolation (no collision)', async () => {
			frontmatter.user_field = 'preserved';
			frontmatter.tags = ['existing'];

			await writeSmartMemoryFrontmatter(mockApp, mockFile, {
				id: 'item-1',
				entities: [{ name: 'Foo', type: 'Concept' }],
				memoryType: 'semantic',
			}, DEFAULT_SETTINGS);

			expect(frontmatter.user_field).toBe('preserved');
			expect(frontmatter.tags).toEqual(['existing']);
		});
	});

	describe('readSmartMemoryId', () => {
		it('reads existing smartmemory_id from frontmatter', () => {
			frontmatter.smartmemory_id = 'item-xyz';
			expect(readSmartMemoryId(mockApp, mockFile)).toBe('item-xyz');
		});

		it('returns null when smartmemory_id absent', () => {
			expect(readSmartMemoryId(mockApp, mockFile)).toBeNull();
		});

		it('returns null when frontmatter absent', () => {
			mockApp.metadataCache.getFileCache = vi.fn(() => null);
			expect(readSmartMemoryId(mockApp, mockFile)).toBeNull();
		});
	});

	describe('clearSmartMemoryFrontmatter', () => {
		it('removes only smartmemory_ prefixed fields', async () => {
			frontmatter.smartmemory_id = 'item-1';
			frontmatter.smartmemory_type = 'semantic';
			frontmatter.user_field = 'keep me';

			await clearSmartMemoryFrontmatter(mockApp, mockFile);

			expect(frontmatter.smartmemory_id).toBeUndefined();
			expect(frontmatter.smartmemory_type).toBeUndefined();
			expect(frontmatter.user_field).toBe('keep me');
		});
	});
});
