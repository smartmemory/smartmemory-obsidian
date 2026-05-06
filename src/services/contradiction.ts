import type { SmartMemoryClient } from 'smartmemory-sdk-js/core';

export type SupersessionKind = 'superseded' | 'supersedes';

export interface SupersessionFinding {
	kind: SupersessionKind;
	otherItemId: string;
	otherSnippet: string;
}

/**
 * Detects supersession relationships via the /memory/{id}/neighbors endpoint.
 * The lineage endpoint walks `derived_from` (derivation), not supersession,
 * so we use neighbors and filter by edge type AND direction.
 *
 * The decision system writes a single canonical edge `newer -[SUPERSEDES]-> older`
 * (no inverse edge). So the asymmetric meaning has to come from the response's
 * `direction` field, added by the server at /memory/{id}/neighbors:
 *   - SUPERSEDES outgoing  → this item supersedes the neighbor
 *   - SUPERSEDES incoming  → this item is superseded by the neighbor
 *   - SUPERSEDED_BY outgoing → this item is superseded (older convention)
 *   - SUPERSEDED_BY incoming → this item supersedes another (older convention)
 *
 * If `direction` is absent (older server), we cannot safely disambiguate and
 * skip the finding rather than risk showing the inverted banner.
 */
export class ContradictionService {
	constructor(private client: SmartMemoryClient) {}

	async checkSupersession(itemId: string): Promise<SupersessionFinding | null> {
		try {
			const result: any = await (this.client.memories as any).getNeighbors(itemId);
			const neighbors: any[] = Array.isArray(result?.neighbors) ? result.neighbors : [];

			for (const n of neighbors) {
				const linkType = String(n?.link_type || '').toUpperCase();
				const direction = String(n?.direction || '').toLowerCase();
				if (direction !== 'outgoing' && direction !== 'incoming') {
					// Server didn't include direction — skip rather than guess.
					continue;
				}

				const isSupersedes = linkType === 'SUPERSEDES';
				const isSupersededBy = linkType === 'SUPERSEDED_BY';
				if (!isSupersedes && !isSupersededBy) continue;

				// Canonical: edge points newer → older with type SUPERSEDES.
				// Inverse SUPERSEDED_BY edge is also tolerated for forward-compat.
				const currentIsSuperseded =
					(isSupersedes && direction === 'incoming') ||
					(isSupersededBy && direction === 'outgoing');
				const currentSupersedes =
					(isSupersedes && direction === 'outgoing') ||
					(isSupersededBy && direction === 'incoming');

				if (currentIsSuperseded) {
					return {
						kind: 'superseded',
						otherItemId: n.item_id,
						otherSnippet: snippet(n.content),
					};
				}
				if (currentSupersedes) {
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
