import { describe, it, expect } from 'vitest';
import { extractNeighborhood, FullGraph } from '../src/services/graph-bfs';

const graph: FullGraph = {
	nodes: [
		{ id: 'a', label: 'A', memory_type: 'semantic' },
		{ id: 'b', label: 'B', memory_type: 'semantic' },
		{ id: 'c', label: 'C', memory_type: 'semantic' },
		{ id: 'd', label: 'D', memory_type: 'semantic' },
		{ id: 'e', label: 'E', memory_type: 'semantic' },
		{ id: 'f', label: 'F', memory_type: 'semantic' },
	],
	edges: [
		{ source: 'a', target: 'b', type: 'RELATED_TO' },
		{ source: 'b', target: 'c', type: 'PART_OF' },
		{ source: 'c', target: 'd', type: 'RELATED_TO' },
		{ source: 'd', target: 'e', type: 'RELATED_TO' },
		{ source: 'a', target: 'f', type: 'SUPERSEDES' },
	],
};

describe('extractNeighborhood', () => {
	it('returns just the focus node at hops=0', () => {
		const result = extractNeighborhood(graph, 'a', { hops: 0, maxNodes: 100 });
		expect(result.nodes.map(n => n.id)).toEqual(['a']);
		expect(result.edges).toEqual([]);
	});

	it('returns 1-hop neighbors and connecting edges', () => {
		const result = extractNeighborhood(graph, 'a', { hops: 1, maxNodes: 100 });
		const ids = new Set(result.nodes.map(n => n.id));
		expect(ids.has('a')).toBe(true);
		expect(ids.has('b')).toBe(true);
		expect(ids.has('f')).toBe(true);
		expect(ids.size).toBe(3);
		// Both edges to neighbors included
		expect(result.edges).toHaveLength(2);
	});

	it('returns 2-hop neighbors', () => {
		const result = extractNeighborhood(graph, 'a', { hops: 2, maxNodes: 100 });
		const ids = new Set(result.nodes.map(n => n.id));
		expect(ids.has('c')).toBe(true);
		expect(ids.size).toBe(4); // a, b, f, c
	});

	it('respects maxNodes cap', () => {
		const result = extractNeighborhood(graph, 'a', { hops: 5, maxNodes: 3 });
		expect(result.nodes.length).toBeLessThanOrEqual(3);
	});

	it('treats edges as undirected for traversal', () => {
		// Starting from c, b should be reachable via the b→c edge
		const result = extractNeighborhood(graph, 'c', { hops: 1, maxNodes: 100 });
		const ids = new Set(result.nodes.map(n => n.id));
		expect(ids.has('b')).toBe(true);
		expect(ids.has('d')).toBe(true);
	});

	it('only includes edges where both endpoints are in the result set', () => {
		const result = extractNeighborhood(graph, 'a', { hops: 1, maxNodes: 100 });
		// b→c edge should NOT be included since c is not in the 1-hop neighborhood
		const hasOrphanEdge = result.edges.some(e => e.source === 'b' && e.target === 'c');
		expect(hasOrphanEdge).toBe(false);
	});

	it('returns empty result when focus node not found', () => {
		const result = extractNeighborhood(graph, 'nonexistent', { hops: 2, maxNodes: 100 });
		expect(result.nodes).toEqual([]);
		expect(result.edges).toEqual([]);
	});
});
