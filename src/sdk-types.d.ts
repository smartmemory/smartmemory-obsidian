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
	}

	export class SmartMemoryClient {
		constructor(config: SmartMemoryClientConfig);
		memories: MemoryAPI;
		graph: GraphAPI;
		setTeamId(teamId: string): void;
		getTeamId(): string | null;
	}
}
