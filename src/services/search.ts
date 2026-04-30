import type { SmartMemoryClient } from 'smartmemory-sdk-js/core';

export interface SearchOptions {
	query: string;
	topK?: number;
	multiHop?: boolean;
	memoryType?: string;
	originPrefix?: string;
	entity?: string;
}

export interface SearchResult {
	itemId: string;
	content: string;
	memoryType: string;
	score: number | null;
	origin: string | null;
	entities: Array<{ name: string; type?: string }>;
	snippet: string;
}

export class SearchService {
	constructor(private client: SmartMemoryClient) {}

	async search(opts: SearchOptions): Promise<SearchResult[]> {
		const payload: any = {
			query: opts.query,
			top_k: opts.topK ?? 10,
			multi_hop: opts.multiHop ?? false,
		};
		if (opts.memoryType) payload.memory_type = opts.memoryType;

		const raw = await this.client.memories.search(payload);
		const results = Array.isArray(raw) ? raw : [];

		return results
			.filter((item: any) => {
				if (opts.originPrefix && !(item.origin || '').startsWith(opts.originPrefix)) return false;
				if (opts.entity) {
					const entities = item.entities || [];
					const found = entities.some((e: any) => e?.name?.toLowerCase().includes(opts.entity!.toLowerCase()));
					if (!found) return false;
				}
				return true;
			})
			.map(toSearchResult);
	}
}

function toSearchResult(item: any): SearchResult {
	return {
		itemId: item.item_id,
		content: item.content || '',
		memoryType: item.memory_type || 'unknown',
		score: typeof item.score === 'number' ? item.score : null,
		origin: item.origin || null,
		entities: item.entities || [],
		snippet: makeSnippet(item.content || ''),
	};
}

function makeSnippet(content: string, maxLen: number = 200): string {
	if (content.length <= maxLen) return content;
	return content.slice(0, maxLen).trimEnd() + '…';
}
