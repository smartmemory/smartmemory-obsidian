import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContradictionService } from '../src/services/contradiction';

function makeClient() {
	return {
		memories: {
			getNeighbors: vi.fn(),
		},
	};
}

describe('ContradictionService.checkSupersession', () => {
	let client: any;
	let service: ContradictionService;

	beforeEach(() => {
		client = makeClient();
		service = new ContradictionService(client);
	});

	it('returns null when item has no SUPERSEDES/SUPERSEDED_BY edges', async () => {
		client.memories.getNeighbors.mockResolvedValue({
			item_id: 'a',
			neighbors: [
				{ item_id: 'b', link_type: 'RELATED_TO', direction: 'outgoing' },
				{ item_id: 'c', link_type: 'PART_OF', direction: 'incoming' },
			],
		});
		const result = await service.checkSupersession('a');
		expect(result).toBeNull();
	});

	it('canonical case: incoming SUPERSEDES edge means current item is superseded', async () => {
		// Decision system writes a single edge: newer -[SUPERSEDES]-> older.
		// From the older note's perspective, that edge is INCOMING.
		client.memories.getNeighbors.mockResolvedValue({
			item_id: 'old',
			neighbors: [
				{ item_id: 'newer', link_type: 'SUPERSEDES', direction: 'incoming', content: 'newer version' },
			],
		});
		const result = await service.checkSupersession('old');
		expect(result?.kind).toBe('superseded');
		expect(result?.otherItemId).toBe('newer');
	});

	it('canonical case: outgoing SUPERSEDES edge means current item supersedes another', async () => {
		client.memories.getNeighbors.mockResolvedValue({
			item_id: 'new',
			neighbors: [
				{ item_id: 'older', link_type: 'SUPERSEDES', direction: 'outgoing', content: 'older version' },
			],
		});
		const result = await service.checkSupersession('new');
		expect(result?.kind).toBe('supersedes');
		expect(result?.otherItemId).toBe('older');
	});

	it('forward-compat: outgoing SUPERSEDED_BY treated as superseded', async () => {
		client.memories.getNeighbors.mockResolvedValue({
			item_id: 'old',
			neighbors: [
				{ item_id: 'newer', link_type: 'SUPERSEDED_BY', direction: 'outgoing', content: 'newer' },
			],
		});
		const result = await service.checkSupersession('old');
		expect(result?.kind).toBe('superseded');
	});

	it('forward-compat: incoming SUPERSEDED_BY treated as supersedes', async () => {
		client.memories.getNeighbors.mockResolvedValue({
			item_id: 'new',
			neighbors: [
				{ item_id: 'older', link_type: 'SUPERSEDED_BY', direction: 'incoming', content: 'older' },
			],
		});
		const result = await service.checkSupersession('new');
		expect(result?.kind).toBe('supersedes');
	});

	it('skips findings when server omits direction (old server) rather than risk inverted banner', async () => {
		client.memories.getNeighbors.mockResolvedValue({
			item_id: 'a',
			neighbors: [
				{ item_id: 'b', link_type: 'SUPERSEDES', content: 'unknown side' },
			],
		});
		const result = await service.checkSupersession('a');
		expect(result).toBeNull();
	});

	it('returns null on API error', async () => {
		client.memories.getNeighbors.mockRejectedValue(new Error('boom'));
		expect(await service.checkSupersession('a')).toBeNull();
	});

	it('handles missing neighbors array gracefully', async () => {
		client.memories.getNeighbors.mockResolvedValue({ item_id: 'a' });
		expect(await service.checkSupersession('a')).toBeNull();
	});
});
