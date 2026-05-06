import type { SmartMemoryClient } from 'smartmemory-sdk-js/core';
import type { FullGraph } from './graph-bfs';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class GraphCache {
	private cached: FullGraph | null = null;
	private cachedAt: number = 0;
	private inflight: Promise<FullGraph> | null = null;
	/** Monotonic generation marker. Each fetch is tagged at start; only the
	 *  highest-generation result wins when writing back to the cache. */
	private generation = 0;
	/** Highest generation that has already been written to the cache.
	 *  Older fetches that complete after a newer one are discarded. */
	private latestWrittenGeneration = 0;

	constructor(private client: SmartMemoryClient) {}

	async get(force = false): Promise<FullGraph> {
		const fresh = !force && this.cached && (Date.now() - this.cachedAt) < CACHE_TTL_MS;
		if (fresh && this.cached) return this.cached;

		// Reuse in-flight only when not forcing: a forced refresh wants
		// guaranteed-fresh data, even if a non-force fetch is already running.
		if (this.inflight && !force) return this.inflight;

		const myGeneration = ++this.generation;
		const fetchPromise = this.fetch().then((result) => {
			// Discard if a newer fetch already wrote to the cache. This prevents
			// a slow earlier request from overwriting fresher data from a
			// force-refresh that landed first.
			if (myGeneration < this.latestWrittenGeneration) {
				return result; // still return to the caller, just don't cache
			}
			this.cached = result;
			this.cachedAt = Date.now();
			this.latestWrittenGeneration = myGeneration;
			return result;
		});

		if (!force) this.inflight = fetchPromise;
		try {
			return await fetchPromise;
		} finally {
			if (this.inflight === fetchPromise) this.inflight = null;
		}
	}

	invalidate(): void {
		this.cached = null;
		this.cachedAt = 0;
	}

	private async fetch(): Promise<FullGraph> {
		const api: any = this.client.graph;
		// SDK exposes getFullGraph(limit?)
		const fn = typeof api.getFullGraph === 'function' ? api.getFullGraph : api.full;
		if (typeof fn !== 'function') {
			throw new Error('GraphAPI.getFullGraph not available in SDK');
		}
		const result = await fn.call(api);

		// Normalize server-side field names (item_id / source_id / target_id /
		// edge_type) to the plugin's internal model (id / source / target /
		// type). Doing this at the API boundary keeps graph-bfs and graph-view
		// free of server-shape concerns. Without this normalization edges'
		// source/target are undefined → BFS produces no adjacency → focus
		// lookup misses → caller falls back to the no-focus branch which drops
		// all edges → graph renders with zero edges and the force layout
		// degenerates into a row/grid arrangement.
		const rawNodes: any[] = Array.isArray(result?.nodes) ? result.nodes : [];
		const rawEdges: any[] = Array.isArray(result?.edges) ? result.edges : [];

		const nodes = rawNodes
			.map((n) => {
				const id = n?.id ?? n?.item_id;
				if (!id) return null;
				return { ...n, id };
			})
			.filter((n): n is any => n !== null);

		const edges = rawEdges
			.map((e) => {
				const source = e?.source ?? e?.source_id;
				const target = e?.target ?? e?.target_id;
				if (!source || !target) return null;
				return { ...e, source, target, type: e?.type ?? e?.edge_type };
			})
			.filter((e): e is any => e !== null);

		return { nodes, edges };
	}
}
