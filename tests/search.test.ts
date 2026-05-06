import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchService } from '../src/services/search';

function makeClient() {
	return {
		memories: {
			search: vi.fn(),
		},
	};
}

describe('SearchService', () => {
	let client: any;
	let service: SearchService;

	beforeEach(() => {
		client = makeClient();
		service = new SearchService(client);
	});

	// SDK contract: search(query: string, { topK, enableHybrid, memoryType })
	// — first arg is the query string, second is the options object.

	it('passes query positionally and topK in options', async () => {
		client.memories.search.mockResolvedValue([]);
		await service.search({ query: 'asimov', topK: 5 });
		expect(client.memories.search).toHaveBeenCalledWith(
			'asimov',
			expect.objectContaining({ topK: 5 }),
		);
	});

	it('uses default topK=10 when not specified', async () => {
		client.memories.search.mockResolvedValue([]);
		await service.search({ query: 'x' });
		expect(client.memories.search).toHaveBeenCalledWith(
			'x',
			expect.objectContaining({ topK: 10 }),
		);
	});

	it('maps API response to SearchResult shape with snippet truncation', async () => {
		const longContent = 'a'.repeat(300);
		client.memories.search.mockResolvedValue([
			{
				item_id: 'i1',
				content: longContent,
				memory_type: 'semantic',
				score: 0.95,
				origin: 'cli:add',
				entities: [{ name: 'X', type: 'Person' }],
			},
		]);

		const results = await service.search({ query: 'x' });
		expect(results).toHaveLength(1);
		expect(results[0].itemId).toBe('i1');
		expect(results[0].score).toBe(0.95);
		expect(results[0].snippet.length).toBeLessThan(longContent.length);
		expect(results[0].snippet.endsWith('…')).toBe(true);
	});

	it('filters results by memoryType via SDK option', async () => {
		client.memories.search.mockResolvedValue([]);
		await service.search({ query: 'x', memoryType: 'semantic' });
		expect(client.memories.search).toHaveBeenCalledWith(
			'x',
			expect.objectContaining({ memoryType: 'semantic' }),
		);
	});

	it('filters results by origin prefix client-side', async () => {
		client.memories.search.mockResolvedValue([
			{ item_id: 'a', content: 'a', origin: 'import:obsidian' },
			{ item_id: 'b', content: 'b', origin: 'cli:add' },
		]);
		const results = await service.search({ query: 'x', originPrefix: 'import:' });
		expect(results).toHaveLength(1);
		expect(results[0].itemId).toBe('a');
	});

	// Note: the prior `entity` post-filter on item.entities was removed because
	// /memory/search responses do not include populated entities for graph-
	// extracted items (the field is null), so the filter never matched in
	// production. The view layer now folds entity-field text into the query
	// instead — see search-view.ts runSearch(). The view-side merge is
	// covered there; SearchService no longer accepts an `entity` option.

	it('handles empty/null search response gracefully', async () => {
		client.memories.search.mockResolvedValue(null);
		const results = await service.search({ query: 'x' });
		expect(results).toEqual([]);
	});

	it('handles wrapped { items: [...] } response shape', async () => {
		client.memories.search.mockResolvedValue({
			items: [{ item_id: 'wrapped', content: 'c' }],
		});
		const results = await service.search({ query: 'x' });
		expect(results).toHaveLength(1);
		expect(results[0].itemId).toBe('wrapped');
	});
});
