import { describe, it, expect, beforeEach } from 'vitest';
import { MappingStore } from '../src/bridge/mapping-store';
import { EMPTY_MAPPINGS } from '../src/types';

describe('MappingStore', () => {
	let store: MappingStore;

	beforeEach(() => {
		store = new MappingStore({ ...EMPTY_MAPPINGS, fileToMemory: {}, memoryToFile: {}, entityToFile: {}, contentHashes: {} });
	});

	describe('set', () => {
		it('updates both directions of the mapping', () => {
			store.set('notes/asimov.md', 'item-abc');
			expect(store.getMemoryId('notes/asimov.md')).toBe('item-abc');
			expect(store.getFilePath('item-abc')).toBe('notes/asimov.md');
		});

		it('overwrites existing mapping for the same file', () => {
			store.set('a.md', 'item-1');
			store.set('a.md', 'item-2');
			expect(store.getMemoryId('a.md')).toBe('item-2');
			expect(store.getFilePath('item-2')).toBe('a.md');
			// Old reverse mapping cleared
			expect(store.getFilePath('item-1')).toBeNull();
		});

		it('reassigning same itemId to a different file clears stale forward mapping', () => {
			// Bug case: same itemId mapped to two files leaves stale forward entry
			store.set('a.md', 'item-1');
			store.set('b.md', 'item-1');
			expect(store.getMemoryId('a.md')).toBeNull(); // stale forward cleared
			expect(store.getMemoryId('b.md')).toBe('item-1');
			expect(store.getFilePath('item-1')).toBe('b.md');
		});
	});

	describe('handleRename', () => {
		it('preserves item mapping under new path', () => {
			store.set('old.md', 'item-1');
			store.handleRename('old.md', 'new.md');
			expect(store.getMemoryId('new.md')).toBe('item-1');
			expect(store.getMemoryId('old.md')).toBeNull();
			expect(store.getFilePath('item-1')).toBe('new.md');
		});

		it('is a no-op when old path has no mapping', () => {
			store.handleRename('nonexistent.md', 'new.md');
			expect(store.getMemoryId('new.md')).toBeNull();
		});

		it('rename onto an existing path clears the displaced reverse mapping', () => {
			// Bug case: rename onto a path that already has a different itemId
			store.set('a.md', 'item-A');
			store.set('b.md', 'item-B');
			store.handleRename('a.md', 'b.md');
			expect(store.getMemoryId('a.md')).toBeNull();
			expect(store.getMemoryId('b.md')).toBe('item-A');
			expect(store.getFilePath('item-A')).toBe('b.md');
			// item-B is no longer mapped to any file
			expect(store.getFilePath('item-B')).toBeNull();
		});
	});

	describe('handleDelete', () => {
		it('removes mapping but does NOT delete the SmartMemory item', () => {
			store.set('a.md', 'item-1');
			store.handleDelete('a.md');
			expect(store.getMemoryId('a.md')).toBeNull();
			expect(store.getFilePath('item-1')).toBeNull();
		});
	});

	describe('content hash', () => {
		it('stores and retrieves content hash for a file', () => {
			store.setContentHash('a.md', 'hash-123');
			expect(store.getContentHash('a.md')).toBe('hash-123');
		});

		it('rename preserves content hash', () => {
			store.set('a.md', 'item-1');
			store.setContentHash('a.md', 'hash-1');
			store.handleRename('a.md', 'b.md');
			expect(store.getContentHash('b.md')).toBe('hash-1');
			expect(store.getContentHash('a.md')).toBeUndefined();
		});

		it('delete removes content hash', () => {
			store.setContentHash('a.md', 'hash-1');
			store.handleDelete('a.md');
			expect(store.getContentHash('a.md')).toBeUndefined();
		});
	});

	describe('entity mapping', () => {
		it('stores entity → file mappings', () => {
			store.setEntityFile('Isaac Asimov', 'people/asimov.md');
			expect(store.getEntityFile('Isaac Asimov')).toBe('people/asimov.md');
		});
	});

	describe('serialization', () => {
		it('serializes to plain object for persistence', () => {
			store.set('a.md', 'item-1');
			store.setContentHash('a.md', 'hash-1');
			store.setEntityFile('Foo', 'foo.md');

			const data = store.toJSON();
			expect(data.fileToMemory).toEqual({ 'a.md': 'item-1' });
			expect(data.memoryToFile).toEqual({ 'item-1': 'a.md' });
			expect(data.contentHashes).toEqual({ 'a.md': 'hash-1' });
			expect(data.entityToFile).toEqual({ 'Foo': 'foo.md' });
		});

		it('round-trips through JSON', () => {
			store.set('a.md', 'item-1');
			const data = store.toJSON();
			const restored = new MappingStore(data);
			expect(restored.getMemoryId('a.md')).toBe('item-1');
			expect(restored.getFilePath('item-1')).toBe('a.md');
		});
	});
});
