import { describe, it, expect, vi } from 'vitest';
import { GraphCache } from '../src/services/graph-cache';

function makeClient(getFullGraph: () => Promise<any>) {
	return { graph: { getFullGraph } } as any;
}

describe('GraphCache', () => {
	it('caches results within TTL', async () => {
		const fn = vi.fn().mockResolvedValue({ nodes: [], edges: [] });
		const cache = new GraphCache(makeClient(fn));
		await cache.get();
		await cache.get();
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('coalesces concurrent non-force calls', async () => {
		const fn = vi.fn().mockResolvedValue({ nodes: [], edges: [] });
		const cache = new GraphCache(makeClient(fn));
		await Promise.all([cache.get(), cache.get(), cache.get()]);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('force=true bypasses in-flight non-force fetch', async () => {
		let resolveFirst: (v: any) => void;
		const firstPromise = new Promise<any>(r => { resolveFirst = r; });
		const fn = vi.fn()
			.mockImplementationOnce(() => firstPromise)
			.mockResolvedValueOnce({ nodes: [{ id: 'fresh' }], edges: [] });

		const cache = new GraphCache(makeClient(fn));
		const first = cache.get(false);
		const second = cache.get(true);

		const secondResult = await second;
		expect(secondResult.nodes[0].id).toBe('fresh');
		expect(fn).toHaveBeenCalledTimes(2);

		// Now resolve the slow first request
		resolveFirst!({ nodes: [{ id: 'stale' }], edges: [] });
		await first;
	});

	it('does NOT overwrite cache when stale (older) fetch returns after newer', async () => {
		let resolveFirst: (v: any) => void;
		const firstPromise = new Promise<any>(r => { resolveFirst = r; });
		const fn = vi.fn()
			.mockImplementationOnce(() => firstPromise)
			.mockResolvedValueOnce({ nodes: [{ id: 'fresh' }], edges: [] });

		const cache = new GraphCache(makeClient(fn));
		const first = cache.get(false);
		await cache.get(true); // force completes first with 'fresh'
		// Now resolve the older fetch with stale data
		resolveFirst!({ nodes: [{ id: 'stale' }], edges: [] });
		await first;

		// Cache should still hold 'fresh', not 'stale'
		const result = await cache.get();
		expect(result.nodes[0].id).toBe('fresh');
	});

	describe('server contract normalization (DIST-OBSIDIAN-1 graph regression)', () => {
		it('maps server item_id → id on nodes', async () => {
			const fn = vi.fn().mockResolvedValue({
				nodes: [
					{ item_id: 'mem-1', label: 'Note A', memory_type: 'semantic' },
					{ item_id: 'mem-2', label: 'Note B', memory_type: 'episodic' },
				],
				edges: [],
			});
			const cache = new GraphCache(makeClient(fn));
			const result = await cache.get();
			expect(result.nodes.map(n => n.id)).toEqual(['mem-1', 'mem-2']);
		});

		it('maps server source_id/target_id → source/target on edges', async () => {
			const fn = vi.fn().mockResolvedValue({
				nodes: [
					{ item_id: 'a' },
					{ item_id: 'b' },
				],
				edges: [
					{ source_id: 'a', target_id: 'b', edge_type: 'PART_OF' },
				],
			});
			const cache = new GraphCache(makeClient(fn));
			const result = await cache.get();
			expect(result.edges).toHaveLength(1);
			expect(result.edges[0].source).toBe('a');
			expect(result.edges[0].target).toBe('b');
			expect(result.edges[0].type).toBe('PART_OF');
		});

		it('drops edges that lack endpoints (defensive)', async () => {
			const fn = vi.fn().mockResolvedValue({
				nodes: [{ item_id: 'a' }],
				edges: [
					{ source_id: 'a', target_id: null },  // dropped
					{ source_id: undefined, target_id: 'a' },  // dropped
					{ source_id: 'a', target_id: 'a' },  // kept (self-edge)
				],
			});
			const cache = new GraphCache(makeClient(fn));
			const result = await cache.get();
			expect(result.edges).toHaveLength(1);
		});

		it('still accepts already-normalized payloads (forward-compat)', async () => {
			const fn = vi.fn().mockResolvedValue({
				nodes: [{ id: 'a', label: 'A' }],
				edges: [{ source: 'a', target: 'a', type: 'X' }],
			});
			const cache = new GraphCache(makeClient(fn));
			const result = await cache.get();
			expect(result.nodes[0].id).toBe('a');
			expect(result.edges[0].source).toBe('a');
			expect(result.edges[0].type).toBe('X');
		});
	});

	it('invalidate clears cache', async () => {
		const fn = vi.fn().mockResolvedValue({ nodes: [], edges: [] });
		const cache = new GraphCache(makeClient(fn));
		await cache.get();
		cache.invalidate();
		await cache.get();
		expect(fn).toHaveBeenCalledTimes(2);
	});
});
