/**
 * Canonical entity-association edge types (DIST-OBSIDIAN-ENTITY-EDGE-1).
 *
 * Extraction writes a memory→entity `CONTAINS_ENTITY` edge AND the reciprocal
 * entity→memory `MENTIONED_IN` edge (smartgraph.add_dual_node / the daemon's
 * local_api). Zettel relations add `MENTIONS`. A consumer that walks
 * `/neighbors` to recover a node's entities (or an entity's notes) must accept
 * ALL of these: keying on only one leg silently drops entities whenever the
 * other leg is the one that surfaced for that node/direction.
 *
 * This is the single source of truth shared by autolink + entity-view so the
 * three call sites can't drift apart again (they previously accepted only
 * MENTIONS/MENTIONED_IN and missed the canonical CONTAINS_ENTITY leg —
 * the same edge `services/ingest.ts` keys on).
 */
export const ENTITY_EDGE_TYPES = ['CONTAINS_ENTITY', 'MENTIONED_IN', 'MENTIONS'] as const;

/** True when a /neighbors edge's link_type denotes an entity association. */
export function isEntityEdge(linkType: unknown): boolean {
	const lt = String(linkType ?? '').toUpperCase();
	return (ENTITY_EDGE_TYPES as readonly string[]).includes(lt);
}

/**
 * From a `/neighbors` response's `neighbors` array, return the counterpart
 * nodes reached via an entity-association edge, deduped by `item_id`.
 *
 * Dedup is required because the same counterpart appears twice — once per leg
 * (CONTAINS_ENTITY one direction, MENTIONED_IN the other). Without it, every
 * entity would be double-counted once we accept both legs.
 */
export function entityNeighbors(neighbors: any[]): any[] {
	const seen = new Set<string>();
	const out: any[] = [];
	for (const n of neighbors ?? []) {
		if (!isEntityEdge(n?.link_type)) continue;
		const id = n?.item_id;
		const key = id != null ? String(id) : '';
		if (key) {
			if (seen.has(key)) continue;
			seen.add(key);
		}
		out.push(n);
	}
	return out;
}
