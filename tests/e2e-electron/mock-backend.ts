/**
 * mock-backend.ts — DIST-OBSIDIAN-E2E-2 (Tier 2)
 *
 * Minimal HTTP server standing in for the SmartMemory API. The ONLY network
 * dependency of the Tier 2 harness — no api.smartmemory.ai, no live stack.
 *
 * It is deliberately permissive: every request is logged, and unmatched paths
 * return a 200 with an empty-but-valid envelope so a launch never hangs on a
 * rejected fetch. Canned panel data is keyed off `provenance_memory_id` /
 * memory id so different active notes return different rows — which is what
 * makes the active-leaf-change refresh scenario observable.
 */
import { createServer, type ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';

export interface MockRequest {
	method: string;
	path: string;
	query: Record<string, string>;
}

export interface MockBackend {
	port: number;
	url: string;
	requests: MockRequest[];
	close: () => Promise<void>;
}

// Canned data keyed by memory id. Distinct content per id so the refresh
// scenario can assert the panel actually changed when the active note changed.
const DECISIONS: Record<string, any[]> = {
	'mem-decisions-001': [
		{
			item_id: 'dec-001',
			content: 'Adopt FalkorDB as the primary graph backend for the memory store.',
			status: 'accepted',
			domain: 'architecture',
			confidence: 0.92,
			provenance_memory_id: 'mem-decisions-001',
		},
		{
			item_id: 'dec-002',
			content: 'Use jsdom for Tier 1 panel tests; real Electron for Tier 2.',
			status: 'accepted',
			domain: 'testing',
			confidence: 0.88,
			provenance_memory_id: 'mem-decisions-001',
		},
	],
	'mem-lineage-001': [
		{
			item_id: 'dec-100',
			content: 'Lineage-source decision: chunk conversations by explicit boundaries.',
			status: 'proposed',
			domain: 'pipeline',
			confidence: 0.71,
			provenance_memory_id: 'mem-lineage-001',
		},
	],
};

const LINEAGE: Record<string, any> = {
	'mem-lineage-001': {
		nodes: [
			{ item_id: 'mem-lineage-001', label: 'Lineage Source', kind: 'origin' },
			{ item_id: 'mem-derived-001', label: 'Derived semantic memory', kind: 'derived' },
		],
		edges: [{ source: 'mem-lineage-001', target: 'mem-derived-001', type: 'DERIVED_FROM' }],
	},
};

const NEIGHBORS: Record<string, any> = {
	'mem-decisions-001': {
		neighbors: [
			{ item_id: 'mem-super-001', direction: 'SUPERSEDED_BY', content: 'Newer fact supersedes this one.' },
		],
	},
};

function send(res: ServerResponse, status: number, body: unknown): void {
	res.writeHead(status, {
		'Content-Type': 'application/json',
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Headers': '*',
		'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
	});
	res.end(JSON.stringify(body));
}

// Pull a memory id out of a path like /memory/mem-lineage-001/lineage
function idFromPath(path: string): string {
	const m = path.match(/\/(mem-[a-z0-9-]+)(?:\/|$)/i);
	return m ? m[1] : '';
}

export function startMockBackend({ log = false }: { log?: boolean } = {}): Promise<MockBackend> {
	const requests: MockRequest[] = [];

	const server = createServer((req, res) => {
		const url = new URL(req.url ?? '/', 'http://127.0.0.1');
		const path = url.pathname;
		requests.push({ method: req.method ?? 'GET', path, query: Object.fromEntries(url.searchParams) });
		if (log) console.log(`[mock-backend] ${req.method} ${req.url}`);

		if (req.method === 'OPTIONS') return send(res, 204, {});

		// Health probe (unauthenticated) — keep the plugin in cloud mode.
		if (path.endsWith('/health')) {
			return send(res, 200, { status: 'ok', mode: 'cloud', service: 'mock-backend' });
		}

		// whoami / me — main.ts reads default_team_id off this.
		if (path.includes('whoami') || path.endsWith('/me') || path.includes('/auth/me')) {
			return send(res, 200, {
				user: { id: 'user-e2e', email: 'e2e@test.com', default_team_id: 'team-e2e' },
				default_team_id: 'team-e2e',
			});
		}

		const memId =
			url.searchParams.get('provenance_memory_id') || url.searchParams.get('memory_id') || idFromPath(path);

		if (path.includes('decision')) {
			const items = DECISIONS[memId] || [];
			return send(res, 200, { items, decisions: items, total: items.length });
		}

		if (path.includes('lineage')) {
			return send(res, 200, LINEAGE[memId] || { nodes: [], edges: [] });
		}

		if (path.includes('neighbor') || path.includes('supersess')) {
			return send(res, 200, NEIGHBORS[memId] || { neighbors: [] });
		}

		// Permissive fallback — never hang a fetch.
		return send(res, 200, { items: [], neighbors: [], nodes: [], edges: [] });
	});

	return new Promise((resolve) => {
		server.listen(0, '127.0.0.1', () => {
			const { port } = server.address() as AddressInfo;
			resolve({
				port,
				url: `http://127.0.0.1:${port}`,
				requests,
				close: () => new Promise<void>((r) => server.close(() => r())),
			});
		});
	});
}
