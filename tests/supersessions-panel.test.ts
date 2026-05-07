/**
 * DIST-OBSIDIAN-PANELS-1 Phase 4: SupersessionsPanel.
 *
 * Tests the pure `extractSupersessionRows` helper. The view itself is
 * thin DOM glue around the result of this function; the asymmetry rules
 * (which direction means superseded vs supersedes) live here.
 */
import { describe, it, expect } from 'vitest';
import { extractSupersessionRows } from '../src/views/supersessions-panel';

describe('extractSupersessionRows', () => {
	it('classifies SUPERSEDES outgoing as currentSupersedes', () => {
		const rows = extractSupersessionRows([
			{ item_id: 'older', content: 'old version', link_type: 'SUPERSEDES', direction: 'outgoing' },
		]);
		expect(rows).toEqual([
			{ kind: 'supersedes', otherItemId: 'older', otherContent: 'old version' },
		]);
	});

	it('classifies SUPERSEDES incoming as currentIsSuperseded', () => {
		const rows = extractSupersessionRows([
			{ item_id: 'newer', content: 'new version', link_type: 'SUPERSEDES', direction: 'incoming' },
		]);
		expect(rows).toEqual([
			{ kind: 'superseded', otherItemId: 'newer', otherContent: 'new version' },
		]);
	});

	it('handles legacy SUPERSEDED_BY edges with inverted direction semantics', () => {
		const rows = extractSupersessionRows([
			{ item_id: 'newer', content: 'new', link_type: 'SUPERSEDED_BY', direction: 'outgoing' },
			{ item_id: 'older', content: 'old', link_type: 'SUPERSEDED_BY', direction: 'incoming' },
		]);
		expect(rows).toEqual([
			{ kind: 'superseded', otherItemId: 'newer', otherContent: 'new' },
			{ kind: 'supersedes', otherItemId: 'older', otherContent: 'old' },
		]);
	});

	it('skips rows without direction (older server, ambiguous)', () => {
		const rows = extractSupersessionRows([
			{ item_id: 'x', content: 'x', link_type: 'SUPERSEDES' },
		]);
		expect(rows).toEqual([]);
	});

	it('ignores unrelated link types', () => {
		const rows = extractSupersessionRows([
			{ item_id: 'a', link_type: 'MENTIONS', direction: 'outgoing' },
			{ item_id: 'b', link_type: 'CONTAINS_ENTITY', direction: 'outgoing' },
			{ item_id: 'c', link_type: 'SUPERSEDES', direction: 'outgoing', content: 'kept' },
		]);
		expect(rows).toEqual([
			{ kind: 'supersedes', otherItemId: 'c', otherContent: 'kept' },
		]);
	});

	it('lists multiple supersession relationships in one pass', () => {
		const rows = extractSupersessionRows([
			{ item_id: 'a', link_type: 'SUPERSEDES', direction: 'outgoing', content: 'A' },
			{ item_id: 'b', link_type: 'SUPERSEDES', direction: 'outgoing', content: 'B' },
			{ item_id: 'c', link_type: 'SUPERSEDES', direction: 'incoming', content: 'C' },
		]);
		expect(rows).toHaveLength(3);
		expect(rows.map(r => r.kind)).toEqual(['supersedes', 'supersedes', 'superseded']);
	});
});
