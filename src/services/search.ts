import type { SmartMemoryClient } from 'smartmemory-sdk-js/core';

export interface SearchOptions {
	query: string;
	topK?: number;
	multiHop?: boolean;
	memoryType?: string;
	originPrefix?: string;
	/** Drop results whose origin starts with any of these prefixes. Used to
	 *  hide tier 3/4 (speculative + system) memories from user-facing
	 *  surfaces like recall. Empty/undefined origin is left untouched
	 *  (legacy items stay visible). */
	excludeOriginPrefixes?: string[];
	/** When true, drop subsequent results whose normalized content matches
	 *  an earlier result. Server-side dedupe is by item_id only, so the
	 *  same content can land twice with different IDs. */
	dedupeContent?: boolean;
}

/**
 * Default origin prefixes excluded from recall: tier 3 (speculative
 * derived) and tier 4 (system infrastructure) per smart-memory's origin
 * policy. `unknown` is included because the server emits it as the
 * literal origin for system-generated records (e.g. user observability
 * "User: <email> via clerk:google" rows, content-chunk descendants
 * with `_<n>` suffix item_ids). Truly legacy user content with no
 * origin field at all is left as empty string and remains visible.
 */
export const RECALL_EXCLUDE_ORIGIN_PREFIXES: string[] = [
	'hook:',
	'structured:',
	'enricher:',
	'conversation:',
	'evolver:opinion',
	'auth:',
	'account:',
	'unknown',
];

export interface SearchResult {
	itemId: string;
	content: string;
	memoryType: string;
	score: number | null;
	origin: string | null;
	entities: Array<{ name: string; type?: string }>;
	title: string;
	snippet: string;
}

export class SearchService {
	constructor(private client: SmartMemoryClient) {}

	async search(opts: SearchOptions): Promise<SearchResult[]> {
		// SDK contract: search(query: string, { topK, enableHybrid, memoryType }).
		// `multi_hop` is not surfaced by the SDK today — DIST-OBSIDIAN-1
		// follow-up to extend the SDK or POST directly. Regular search
		// already covers the golden flow.
		const sdkOpts: any = { topK: opts.topK ?? 10 };
		if (opts.memoryType) sdkOpts.memoryType = opts.memoryType;

		const raw: any = await this.client.memories.search(opts.query, sdkOpts);
		// /memory/search returns { items: [...] } in newer servers; older
		// shape returned the array directly. Handle both.
		const results: any[] = Array.isArray(raw)
			? raw
			: Array.isArray(raw?.items)
				? raw.items
				: Array.isArray(raw?.results)
					? raw.results
					: [];

		// Client-side dedup by item_id. The server's RRF merge across hybrid /
		// multi-hop channels can return the same item_id more than once when
		// it scores in multiple channels. Until the server enforces uniqueness,
		// we keep the first (highest-ranked) occurrence and drop subsequent
		// duplicates. Cheap and correct regardless of upstream behavior.
		const seen = new Set<string>();
		const seenContent = new Set<string>();
		const excludePrefixes = opts.excludeOriginPrefixes ?? [];
		return results
			.filter((item: any) => {
				const origin = item.origin || '';
				if (opts.originPrefix && !origin.startsWith(opts.originPrefix)) return false;
				// Only filter by exclude prefixes when origin is set — empty
				// origin means legacy/unknown, which the project policy
				// keeps visible.
				if (origin && excludePrefixes.some(p => origin.startsWith(p))) return false;
				const id = item.item_id;
				if (!id) return false;
				if (seen.has(id)) return false;
				seen.add(id);
				if (opts.dedupeContent) {
					const key = (item.content || '').trim();
					if (key && seenContent.has(key)) return false;
					if (key) seenContent.add(key);
				}
				return true;
			})
			.map(toSearchResult);
	}
}

function toSearchResult(item: any): SearchResult {
	const cleaned = stripLeadingYaml(item.content || '');
	return {
		itemId: item.item_id,
		content: item.content || '',
		memoryType: item.memory_type || 'unknown',
		score: typeof item.score === 'number' ? item.score : null,
		origin: item.origin || null,
		entities: item.entities || [],
		title: makeTitle(cleaned),
		snippet: makeSnippet(cleaned),
	};
}

function makeSnippet(content: string, maxLen: number = 200): string {
	const trimmed = content.trim();
	if (trimmed.length <= maxLen) return trimmed;
	return trimmed.slice(0, maxLen).trimEnd() + '…';
}

function makeTitle(content: string, maxLen: number = 60): string {
	const firstLine = content.trim().split(/\r?\n/, 1)[0] ?? '';
	if (firstLine.length <= maxLen) return firstLine || '(untitled)';
	return firstLine.slice(0, maxLen).trimEnd() + '…';
}

/**
 * Strip a leading YAML block from server-stored content. Necessary because
 * historic ingests (before the plugin's stripFrontmatter fix) saved raw notes
 * including their `---` frontmatter block. New ingests no longer do this, but
 * the rendered view still has to be defensive against legacy items.
 */
function stripLeadingYaml(raw: string): string {
	if (!raw.startsWith('---')) return raw;
	const end = raw.indexOf('\n---', 3);
	if (end < 0) return raw;
	const after = raw.slice(end + 4);
	return after.replace(/^\r?\n/, '');
}
