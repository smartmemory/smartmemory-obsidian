import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContradictionService } from '../src/services/contradiction';

function makeClient() {
	return {
		memories: {
			neighbors: vi.fn(),
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
		client.memories.neighbors.mockResolvedValue({
			item_id: 'a',
			neighbors: [
				{ item_id: 'b', link_type: 'RELATED_TO' },
				{ item_id: 'c', link_type: 'PART_OF' },
			],
		});
		const result = await service.checkSupersession('a');
		expect(result).toBeNull();
	});

	it('detects when item has been superseded (incoming SUPERSEDED_BY edge)', async () => {
		client.memories.neighbors.mockResolvedValue({
			item_id: 'a',
			neighbors: [
				{ item_id: 'newer', link_type: 'SUPERSEDED_BY', content: 'newer version' },
			],
		});
		const result = await service.checkSupersession('a');
		expect(result).not.toBeNull();
		expect(result?.kind).toBe('superseded');
		expect(result?.otherItemId).toBe('newer');
	});

	it('detects when item supersedes another (outgoing SUPERSEDES edge)', async () => {
		client.memories.neighbors.mockResolvedValue({
			item_id: 'a',
			neighbors: [
				{ item_id: 'older', link_type: 'SUPERSEDES', content: 'older version' },
			],
		});
		const result = await service.checkSupersession('a');
		expect(result).not.toBeNull();
		expect(result?.kind).toBe('supersedes');
		expect(result?.otherItemId).toBe('older');
	});

	it('returns null on API error', async () => {
		client.memories.neighbors.mockRejectedValue(new Error('boom'));
		const result = await service.checkSupersession('a');
		expect(result).toBeNull();
	});

	it('handles missing neighbors array gracefully', async () => {
		client.memories.neighbors.mockResolvedValue({ item_id: 'a' });
		const result = await service.checkSupersession('a');
		expect(result).toBeNull();
	});
});
