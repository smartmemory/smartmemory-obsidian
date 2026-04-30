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

	it('invalidate clears cache', async () => {
		const fn = vi.fn().mockResolvedValue({ nodes: [], edges: [] });
		const cache = new GraphCache(makeClient(fn));
		await cache.get();
		cache.invalidate();
		await cache.get();
		expect(fn).toHaveBeenCalledTimes(2);
	});
});
