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
		ingest(payload: { content: string; metadata?: any; origin?: string }): Promise<any>;
		update(itemId: string, payload: any): Promise<any>;
		search(payload: any): Promise<any[]>;
		neighbors(itemId: string): Promise<{ neighbors: any[]; item_id: string }>;
		lineage(itemId: string): Promise<{ lineage: any[]; depth: number }>;
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
