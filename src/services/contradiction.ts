import type { SmartMemoryClient } from 'smartmemory-sdk-js/core';

export type SupersessionKind = 'superseded' | 'supersedes';

export interface SupersessionFinding {
	kind: SupersessionKind;
	otherItemId: string;
	otherSnippet: string;
}

const SUPERSEDED_BY_TYPES = new Set(['SUPERSEDED_BY', 'SUPERCEDED_BY']);
const SUPERSEDES_TYPES = new Set(['SUPERSEDES', 'SUPERCEDES']);

/**
 * Detects supersession relationships via the /memory/{id}/neighbors endpoint.
 * The lineage endpoint walks `derived_from` (derivation), not supersession,
 * so we use neighbors and filter by edge type.
 */
export class ContradictionService {
	constructor(private client: SmartMemoryClient) {}

	async checkSupersession(itemId: string): Promise<SupersessionFinding | null> {
		try {
			const result: any = await (this.client.memories as any).neighbors(itemId);
			const neighbors: any[] = Array.isArray(result?.neighbors) ? result.neighbors : [];

			for (const n of neighbors) {
				const linkType = String(n?.link_type || '').toUpperCase();
				if (SUPERSEDED_BY_TYPES.has(linkType)) {
					return {
						kind: 'superseded',
						otherItemId: n.item_id,
						otherSnippet: snippet(n.content),
					};
				}
				if (SUPERSEDES_TYPES.has(linkType)) {
					return {
						kind: 'supersedes',
						otherItemId: n.item_id,
						otherSnippet: snippet(n.content),
					};
				}
			}
			return null;
		} catch {
			return null;
		}
	}
}

function snippet(s: any): string {
	if (typeof s !== 'string') return '';
	return s.length > 100 ? s.slice(0, 100) + '…' : s;
}
