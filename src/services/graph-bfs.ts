export interface GraphNode {
	id: string;
	label?: string;
	memory_type?: string;
	entity_type?: string;
	[key: string]: any;
}

export interface GraphEdge {
	source: string;
	target: string;
	type?: string;
	[key: string]: any;
}

export interface FullGraph {
	nodes: GraphNode[];
	edges: GraphEdge[];
}

export interface NeighborhoodOptions {
	hops: number;
	maxNodes: number;
}

/**
 * Client-side BFS to extract an N-hop neighborhood around a focus node.
 *
 * Operates on the cached full-workspace graph from GET /memory/graph/full,
 * eliminating the N+1 query pattern that chained /neighbors calls would create.
 *
 * Edges are treated as undirected for traversal — the supersession or PART_OF
 * direction matters for rendering but not for "what's connected".
 *
 * Returns only edges where BOTH endpoints are in the result set; edges
 * leading outside the neighborhood are pruned.
 */
export function extractNeighborhood(
	graph: FullGraph,
	focusId: string,
	options: NeighborhoodOptions,
): FullGraph {
	const focusNode = graph.nodes.find(n => n.id === focusId);
	if (!focusNode) return { nodes: [], edges: [] };

	// Build adjacency for fast traversal
	const adjacency = new Map<string, Set<string>>();
	for (const edge of graph.edges) {
		if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
		if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set());
		adjacency.get(edge.source)!.add(edge.target);
		adjacency.get(edge.target)!.add(edge.source);
	}

	// BFS up to `hops` levels
	const visited = new Set<string>([focusId]);
	let frontier: string[] = [focusId];
	for (let depth = 0; depth < options.hops; depth++) {
		const nextFrontier: string[] = [];
		for (const nodeId of frontier) {
			const neighbors = adjacency.get(nodeId);
			if (!neighbors) continue;
			for (const neighborId of neighbors) {
				if (visited.has(neighborId)) continue;
				if (visited.size >= options.maxNodes) break;
				visited.add(neighborId);
				nextFrontier.push(neighborId);
			}
			if (visited.size >= options.maxNodes) break;
		}
		frontier = nextFrontier;
		if (frontier.length === 0) break;
	}

	const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));
	const resultNodes: GraphNode[] = [];
	for (const id of visited) {
		const node = nodeMap.get(id);
		if (node) resultNodes.push(node);
	}

	const resultEdges = graph.edges.filter(
		e => visited.has(e.source) && visited.has(e.target)
	);

	return { nodes: resultNodes, edges: resultEdges };
}

const STRUCTURAL_EDGE_TYPES = new Set([
	'PART_OF',
	'SUPERSEDES',
	'SUPERSEDED_BY',
	'DERIVED_FROM',
	'HAS_VERSION',
]);

export function isStructuralEdge(edgeType: string | undefined): boolean {
	return edgeType ? STRUCTURAL_EDGE_TYPES.has(edgeType) : false;
}
