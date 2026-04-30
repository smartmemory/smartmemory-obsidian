import type { SmartMemoryClient } from 'smartmemory-sdk-js/core';
import type { FullGraph } from './graph-bfs';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class GraphCache {
	private cached: FullGraph | null = null;
	private cachedAt: number = 0;
	private inflight: Promise<FullGraph> | null = null;

	constructor(private client: SmartMemoryClient) {}

	async get(force = false): Promise<FullGraph> {
		const fresh = !force && this.cached && (Date.now() - this.cachedAt) < CACHE_TTL_MS;
		if (fresh && this.cached) return this.cached;

		if (this.inflight) return this.inflight;

		this.inflight = this.fetch();
		try {
			const result = await this.inflight;
			this.cached = result;
			this.cachedAt = Date.now();
			return result;
		} finally {
			this.inflight = null;
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
