declare module 'smartmemory-sdk-js/core' {
	export interface SmartMemoryClientConfig {
		mode?: 'apiKey' | 'sso';
		apiKey?: string;
		apiBaseUrl: string;
		fetchFn?: typeof fetch;
		webAppUrl?: string;
		endpoints?: Record<string, string>;
		storage?: 'localStorage' | 'sessionStorage' | 'memory';
	}

	export interface MemoryAPI {
		list(params?: { limit?: number; offset?: number }): Promise<{ items: any[]; total: number }>;
		get(itemId: string): Promise<any>;
		ingest(content: string, params?: {
			profileName?: string | null;
			extractorName?: string;
			context?: Record<string, any>;
		}): Promise<any>;
		update(itemId: string, payload: any): Promise<any>;
		search(query: string, params?: {
			topK?: number;
			enableHybrid?: boolean;
			memoryType?: string | null;
			expertise?: boolean;
			cite?: boolean;
			decompose?: boolean;
			multiHop?: boolean;
			maxHops?: number;
			budgetMs?: number;
			semanticHops?: boolean;
			includeReference?: boolean;
			includeConsolidated?: boolean;
			consolidationFirst?: boolean;
		}): Promise<any>;
		// Match the runtime SDK (smart-memory-sdk-js MemoryAPI.js getNeighbors/
		// getLineage). Prior `neighbors`/`lineage` declarations were wishful and
		// caused LineagePanel to silently no-op in production since 0.2.6 —
		// caught by DIST-OBSIDIAN-E2E-1 harness backfill 2026-05-23.
		getNeighbors(itemId: string): Promise<{ neighbors: any[]; item_id: string }>;
		getLineage(itemId: string): Promise<{ lineage: any[]; depth: number }>;
	}

	export interface GraphAPI {
		full(): Promise<{ nodes: any[]; edges: any[] }>;
		path(startId: string, endId: string, maxHops?: number): Promise<any>;
		[key: string]: any;
	}

	/**
	 * DecisionAPI shim (DIST-OBSIDIAN-PANELS-1 Phase 5,
	 * consumes CORE-DECISION-PROVENANCE-LOOKUP-1).
	 *
	 * The runtime SDK's `client.decisions.list(params)` accepts arbitrary
	 * params via `URLSearchParams` pass-through, so any new server query
	 * params are settable without a code change. We type only the ones we
	 * use; unrecognized keys are still accepted.
	 */
	export interface DecisionListParams {
		domain?: string;
		decision_type?: string;
		min_confidence?: number;
		limit?: number;
		/** Inverse-provenance filter (CORE-DECISION-PROVENANCE-LOOKUP-1). */
		provenance_memory_id?: string;
		[key: string]: any;
	}

	export interface DecisionListResponse {
		decisions: Array<{
			decision_id: string;
			content?: string;
			status?: string;
			decision_type?: string;
			confidence?: number;
			domain?: string;
			created_at?: string;
			[key: string]: any;
		}>;
		count: number;
	}

	export interface DecisionAPI {
		list(params?: DecisionListParams): Promise<DecisionListResponse>;
		[key: string]: any;
	}

	export class SmartMemoryClient {
		constructor(config: SmartMemoryClientConfig);
		memories: MemoryAPI;
		graph: GraphAPI;
		decisions: DecisionAPI;
		setTeamId(teamId: string): void;
		getTeamId(): string | null;
	}
}

declare module 'js-yaml' {
	export function load(source: string): unknown;
	export function dump(value: unknown, options?: {
		noRefs?: boolean;
		sortKeys?: boolean;
		lineWidth?: number;
		noCompatMode?: boolean;
	}): string;
}
