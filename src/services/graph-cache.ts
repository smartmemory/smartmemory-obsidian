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
		return {
			nodes: Array.isArray(result?.nodes) ? result.nodes : [],
			edges: Array.isArray(result?.edges) ? result.edges : [],
		};
	}
}
