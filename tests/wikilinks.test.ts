import { describe, it, expect } from 'vitest';
import { findEntityMentions, applyLinkInsertions, LinkProposal } from '../src/bridge/wikilinks';

describe('findEntityMentions', () => {
	it('finds whole-word matches in prose', () => {
		const text = 'Isaac Asimov wrote the Foundation series.';
		const proposals = findEntityMentions(text, [
			{ name: 'Isaac Asimov', target: 'people/asimov.md' },
		]);
		expect(proposals).toHaveLength(1);
		expect(proposals[0].entityName).toBe('Isaac Asimov');
		expect(proposals[0].target).toBe('people/asimov.md');
	});

	it('is case-insensitive', () => {
		const text = 'isaac asimov wrote books.';
		const proposals = findEntityMentions(text, [
			{ name: 'Isaac Asimov', target: 'people/asimov.md' },
		]);
		expect(proposals).toHaveLength(1);
	});

	it('does not match partial words', () => {
		const text = 'The Asimovian style is unique.';
		const proposals = findEntityMentions(text, [
			{ name: 'Asimov', target: 'people/asimov.md' },
		]);
		expect(proposals).toHaveLength(0);
	});

	it('skips mentions inside fenced code blocks', () => {
		const text = '```\nIsaac Asimov is a name in code\n```\nIsaac Asimov outside.';
		const proposals = findEntityMentions(text, [
			{ name: 'Isaac Asimov', target: 'people/asimov.md' },
		]);
		expect(proposals).toHaveLength(1);
		// Match must be in the prose part, not the code block
		expect(proposals[0].start).toBeGreaterThan(text.indexOf('```\n', 4));
	});

	it('skips mentions inside inline code', () => {
		const text = '`Isaac Asimov` is in code. But Isaac Asimov here is prose.';
		const proposals = findEntityMentions(text, [
			{ name: 'Isaac Asimov', target: 'people/asimov.md' },
		]);
		expect(proposals).toHaveLength(1);
	});

	it('skips mentions inside YAML frontmatter', () => {
		const text = '---\ntitle: Isaac Asimov\n---\n\nMain body about Isaac Asimov.';
		const proposals = findEntityMentions(text, [
			{ name: 'Isaac Asimov', target: 'people/asimov.md' },
		]);
		expect(proposals).toHaveLength(1);
		expect(proposals[0].start).toBeGreaterThan(text.indexOf('---', 4) + 3);
	});

	it('skips mentions already wrapped in [[wikilink]]', () => {
		const text = 'See [[Isaac Asimov]] for more. Isaac Asimov elsewhere.';
		const proposals = findEntityMentions(text, [
			{ name: 'Isaac Asimov', target: 'people/asimov.md' },
		]);
		expect(proposals).toHaveLength(1);
		expect(proposals[0].start).toBeGreaterThan(text.indexOf(']]'));
	});

	it('skips mentions inside markdown links [text](url)', () => {
		const text = 'See [Isaac Asimov](https://example.com). Isaac Asimov in prose.';
		const proposals = findEntityMentions(text, [
			{ name: 'Isaac Asimov', target: 'people/asimov.md' },
		]);
		expect(proposals).toHaveLength(1);
	});

	it('skips bare URLs containing entity name', () => {
		const text = 'Visit https://example.com/Isaac-Asimov for more. Then Isaac Asimov.';
		const proposals = findEntityMentions(text, [
			{ name: 'Isaac Asimov', target: 'people/asimov.md' },
		]);
		// Hyphenated URL won't match whole word anyway, but if entity were "Asimov":
		const proposals2 = findEntityMentions(text, [
			{ name: 'example.com', target: 'sites/example.md' },
		]);
		// example.com appears in URL — should be skipped
		expect(proposals2).toHaveLength(0);
	});

	it('finds multiple distinct entity matches', () => {
		const text = 'Isaac Asimov wrote about Foundation. Foundation is a great work.';
		const proposals = findEntityMentions(text, [
			{ name: 'Isaac Asimov', target: 'asimov.md' },
			{ name: 'Foundation', target: 'foundation.md' },
		]);
		expect(proposals).toHaveLength(3); // 1 Asimov + 2 Foundation
	});

	it('returns proposals in document order', () => {
		const text = 'Foundation came first. Then Isaac Asimov.';
		const proposals = findEntityMentions(text, [
			{ name: 'Isaac Asimov', target: 'asimov.md' },
			{ name: 'Foundation', target: 'foundation.md' },
		]);
		expect(proposals[0].entityName).toBe('Foundation');
		expect(proposals[1].entityName).toBe('Isaac Asimov');
	});

	it('deconflicts overlapping matches: keeps the longer match', () => {
		const text = 'I live in New York City.';
		const proposals = findEntityMentions(text, [
			{ name: 'New York', target: 'newyork.md' },
			{ name: 'York', target: 'york.md' },
		]);
		expect(proposals).toHaveLength(1);
		expect(proposals[0].entityName).toBe('New York');
	});

	it('deconflicts when shorter match comes first in candidate list', () => {
		const text = 'The Empire State Building stands tall.';
		const proposals = findEntityMentions(text, [
			{ name: 'State', target: 'state.md' },
			{ name: 'Empire State Building', target: 'esb.md' },
		]);
		expect(proposals).toHaveLength(1);
		expect(proposals[0].entityName).toBe('Empire State Building');
	});

	it('handles empty entity list', () => {
		expect(findEntityMentions('any text', [])).toEqual([]);
	});

	it('handles empty text', () => {
		expect(findEntityMentions('', [{ name: 'x', target: 'x.md' }])).toEqual([]);
	});
});

describe('applyLinkInsertions', () => {
	it('wraps the matched text in [[wikilinks]]', () => {
		const text = 'Isaac Asimov wrote books.';
		const proposals: LinkProposal[] = [
			{
				entityName: 'Isaac Asimov',
				matchedText: 'Isaac Asimov',
				target: 'people/asimov',
				start: 0,
				end: 12,
			},
		];
		const result = applyLinkInsertions(text, proposals);
		expect(result).toBe('[[people/asimov|Isaac Asimov]] wrote books.');
	});

	it('preserves casing of the matched text via display alias', () => {
		const text = 'asimov wrote books.';
		const proposals: LinkProposal[] = [
			{
				entityName: 'Asimov',
				matchedText: 'asimov',
				target: 'asimov',
				start: 0,
				end: 6,
			},
		];
		const result = applyLinkInsertions(text, proposals);
		expect(result).toBe('[[asimov|asimov]] wrote books.');
	});

	it('applies multiple insertions correctly (back-to-front)', () => {
		const text = 'A wrote about B.';
		const proposals: LinkProposal[] = [
			{ entityName: 'A', matchedText: 'A', target: 'a', start: 0, end: 1 },
			{ entityName: 'B', matchedText: 'B', target: 'b', start: 14, end: 15 },
		];
		const result = applyLinkInsertions(text, proposals);
		expect(result).toBe('[[a|A]] wrote about [[b|B]].');
	});

	it('returns unchanged text when no proposals are accepted', () => {
		expect(applyLinkInsertions('abc', [])).toBe('abc');
	});
});
