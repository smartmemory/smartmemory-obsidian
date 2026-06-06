/**
 * Tests for the canonical entity-edge helper (DIST-OBSIDIAN-ENTITY-EDGE-1).
 *
 * Regression guard: autolink + entity-view used to accept only
 * MENTIONS / MENTIONED_IN and dropped the canonical CONTAINS_ENTITY leg that
 * extraction actually writes (smartgraph.add_dual_node), so extracted
 * entities were silently missed whenever CONTAINS_ENTITY was the surfaced leg.
 */
import { describe, it, expect } from 'vitest';
import { isEntityEdge, entityNeighbors, ENTITY_EDGE_TYPES } from '../src/bridge/entity-edges';

describe('isEntityEdge', () => {
	it('accepts the canonical extraction edge CONTAINS_ENTITY', () => {
		expect(isEntityEdge('CONTAINS_ENTITY')).toBe(true);
	});
	it('accepts the reciprocal MENTIONED_IN leg', () => {
		expect(isEntityEdge('MENTIONED_IN')).toBe(true);
	});
	it('accepts the zettel MENTIONS relation', () => {
		expect(isEntityEdge('MENTIONS')).toBe(true);
	});
	it('is case-insensitive', () => {
		expect(isEntityEdge('contains_entity')).toBe(true);
	});
	it('rejects unrelated / infra edges', () => {
		expect(isEntityEdge('RELATES_TO')).toBe(false);
		expect(isEntityEdge('SUPERSEDES')).toBe(false);
		expect(isEntityEdge(undefined)).toBe(false);
		expect(isEntityEdge(null)).toBe(false);
		expect(isEntityEdge('')).toBe(false);
	});
	it('exports the three canonical types', () => {
		expect([...ENTITY_EDGE_TYPES].sort()).toEqual(['CONTAINS_ENTITY', 'MENTIONED_IN', 'MENTIONS']);
	});
});

describe('entityNeighbors', () => {
	it('captures an entity reachable only via CONTAINS_ENTITY (the bug)', () => {
		const out = entityNeighbors([
			{ item_id: 'ent-1', link_type: 'CONTAINS_ENTITY', direction: 'outgoing' },
		]);
		expect(out).toHaveLength(1);
		expect(out[0].item_id).toBe('ent-1');
	});

	it('dedups the same counterpart surfaced via both legs', () => {
		const out = entityNeighbors([
			{ item_id: 'ent-1', link_type: 'CONTAINS_ENTITY', direction: 'outgoing' },
			{ item_id: 'ent-1', link_type: 'MENTIONED_IN', direction: 'incoming' },
		]);
		expect(out).toHaveLength(1);
		expect(out[0].item_id).toBe('ent-1');
	});

	it('drops non-entity edges', () => {
		const out = entityNeighbors([
			{ item_id: 'ent-1', link_type: 'CONTAINS_ENTITY' },
			{ item_id: 'x', link_type: 'RELATES_TO' },
			{ item_id: 'y', link_type: 'SUPERSEDES' },
		]);
		expect(out.map(n => n.item_id)).toEqual(['ent-1']);
	});

	it('keeps distinct entities', () => {
		const out = entityNeighbors([
			{ item_id: 'ent-1', link_type: 'CONTAINS_ENTITY' },
			{ item_id: 'ent-2', link_type: 'MENTIONED_IN' },
		]);
		expect(out.map(n => n.item_id).sort()).toEqual(['ent-1', 'ent-2']);
	});

	it('tolerates an empty / missing list', () => {
		expect(entityNeighbors([])).toEqual([]);
		expect(entityNeighbors(undefined as never)).toEqual([]);
	});
});
