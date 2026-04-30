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

	it('passes query and top_k to client.memories.search', async () => {
		client.memories.search.mockResolvedValue([]);
		await service.search({ query: 'asimov', topK: 5 });
		expect(client.memories.search).toHaveBeenCalledWith(expect.objectContaining({
			query: 'asimov',
			top_k: 5,
			multi_hop: false,
		}));
	});

	it('forwards multi_hop=true when requested', async () => {
		client.memories.search.mockResolvedValue([]);
		await service.search({ query: 'x', multiHop: true });
		expect(client.memories.search).toHaveBeenCalledWith(expect.objectContaining({ multi_hop: true }));
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

	it('filters results by memory_type via API param', async () => {
		client.memories.search.mockResolvedValue([]);
		await service.search({ query: 'x', memoryType: 'semantic' });
		expect(client.memories.search).toHaveBeenCalledWith(expect.objectContaining({ memory_type: 'semantic' }));
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

	it('filters results by entity name (case-insensitive)', async () => {
		client.memories.search.mockResolvedValue([
			{ item_id: 'a', content: 'a', entities: [{ name: 'Isaac Asimov' }] },
			{ item_id: 'b', content: 'b', entities: [{ name: 'Other' }] },
		]);
		const results = await service.search({ query: 'x', entity: 'asimov' });
		expect(results).toHaveLength(1);
		expect(results[0].itemId).toBe('a');
	});

	it('handles empty/null search response gracefully', async () => {
		client.memories.search.mockResolvedValue(null);
		const results = await service.search({ query: 'x' });
		expect(results).toEqual([]);
	});
});
