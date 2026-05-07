/**
 * Per-id endpoint cache (DIST-OBSIDIAN-PANELS-1).
 *
 * Right-panel views all key on `smartmemory_id` and call SmartMemory API
 * endpoints (`/memory/{id}/...`). Without coordination, opening N panels
 * fans out N round trips per active-leaf change.
 *
 * This cache:
 *   1. Returns the same Promise to concurrent callers for the same key,
 *      so simultaneous panel renders share one in-flight request.
 *   2. Caches resolved results for `TTL_MS` so a leaf change → leaf
 *      change → leaf change burst doesn't re-fetch.
 *   3. Surfaces errors transparently — failed fetches are NOT cached,
 *      so retry works on next call.
 *
 * Not in scope: storage between sessions (panels re-fetch on plugin
 * load, which is correct — TTL is short and freshness matters).
 */

const TTL_MS = 30_000;

interface Entry<T> {
	promise: Promise<T>;
	resolvedAt: number | null; // null = still in-flight or rejected
}

export class PerIdCache {
	private store = new Map<string, Entry<unknown>>();

	private key(memoryId: string, endpoint: string): string {
		return `${memoryId}::${endpoint}`;
	}

	/**
	 * Read-through cache. If a fresh value or in-flight Promise exists
	 * for `(memoryId, endpoint)`, return it; otherwise call `fetcher`.
	 * Failed fetches are dropped from the cache so retries work.
	 */
	async get<T>(memoryId: string, endpoint: string, fetcher: () => Promise<T>): Promise<T> {
		const k = this.key(memoryId, endpoint);
		const existing = this.store.get(k) as Entry<T> | undefined;
		if (existing) {
			// Resolved and within TTL — reuse.
			if (existing.resolvedAt !== null && Date.now() - existing.resolvedAt < TTL_MS) {
				return existing.promise;
			}
			// In-flight — share the same Promise.
			if (existing.resolvedAt === null) {
				return existing.promise;
			}
			// Expired — fall through and re-fetch.
		}

		const entry: Entry<T> = { promise: Promise.resolve() as Promise<T>, resolvedAt: null };
		entry.promise = fetcher().then(
			(value) => {
				entry.resolvedAt = Date.now();
				return value;
			},
			(err) => {
				// Drop failed entries so the next call retries.
				if (this.store.get(k) === (entry as Entry<unknown>)) {
					this.store.delete(k);
				}
				throw err;
			},
		);
		this.store.set(k, entry as Entry<unknown>);
		return entry.promise;
	}

	/** Invalidate one (memoryId, endpoint) or all entries for a memoryId. */
	invalidate(memoryId: string, endpoint?: string): void {
		if (endpoint) {
			this.store.delete(this.key(memoryId, endpoint));
			return;
		}
		const prefix = `${memoryId}::`;
		for (const k of this.store.keys()) {
			if (k.startsWith(prefix)) this.store.delete(k);
		}
	}

	clear(): void {
		this.store.clear();
	}
}
