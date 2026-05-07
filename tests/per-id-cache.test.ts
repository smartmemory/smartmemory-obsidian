import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PerIdCache } from '../src/services/per-id-cache';

describe('PerIdCache', () => {
	let cache: PerIdCache;

	beforeEach(() => {
		cache = new PerIdCache();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('shares one Promise across concurrent callers for the same key', async () => {
		let calls = 0;
		const fetcher = vi.fn(async () => {
			calls++;
			return 'value';
		});

		// Two concurrent gets for the same key — fetcher must run once.
		const [a, b] = await Promise.all([
			cache.get('id1', '/x', fetcher),
			cache.get('id1', '/x', fetcher),
		]);

		expect(a).toBe('value');
		expect(b).toBe('value');
		expect(calls).toBe(1);
	});

	it('caches resolved values within TTL', async () => {
		let calls = 0;
		const fetcher = async () => {
			calls++;
			return calls;
		};

		const a = await cache.get('id1', '/x', fetcher);
		const b = await cache.get('id1', '/x', fetcher);
		expect(a).toBe(1);
		expect(b).toBe(1); // served from cache
		expect(calls).toBe(1);
	});

	it('re-fetches after TTL expires', async () => {
		let calls = 0;
		const fetcher = async () => {
			calls++;
			return calls;
		};

		await cache.get('id1', '/x', fetcher);
		expect(calls).toBe(1);

		vi.advanceTimersByTime(31_000); // past 30s TTL

		await cache.get('id1', '/x', fetcher);
		expect(calls).toBe(2);
	});

	it('drops failed fetches so retries work', async () => {
		let calls = 0;
		const fetcher = async () => {
			calls++;
			if (calls === 1) throw new Error('boom');
			return 'ok';
		};

		await expect(cache.get('id1', '/x', fetcher)).rejects.toThrow('boom');
		// Next call must retry, not return cached error.
		const result = await cache.get('id1', '/x', fetcher);
		expect(result).toBe('ok');
		expect(calls).toBe(2);
	});

	it('isolates entries by memory id and endpoint', async () => {
		const f = (label: string) => vi.fn(async () => label);
		const fA = f('A');
		const fB = f('B');
		const fC = f('C');

		await cache.get('id1', '/x', fA);
		await cache.get('id2', '/x', fB);
		await cache.get('id1', '/y', fC);

		expect(fA).toHaveBeenCalledTimes(1);
		expect(fB).toHaveBeenCalledTimes(1);
		expect(fC).toHaveBeenCalledTimes(1);
	});

	it('invalidate(id, endpoint) removes only that entry', async () => {
		let calls = 0;
		const fetcher = async () => ++calls;

		await cache.get('id1', '/x', fetcher);
		await cache.get('id1', '/y', fetcher);
		expect(calls).toBe(2);

		cache.invalidate('id1', '/x');

		await cache.get('id1', '/x', fetcher); // re-fetch
		await cache.get('id1', '/y', fetcher); // still cached
		expect(calls).toBe(3);
	});

	it('invalidate(id) removes all entries for that id', async () => {
		let calls = 0;
		const fetcher = async () => ++calls;

		await cache.get('id1', '/x', fetcher);
		await cache.get('id1', '/y', fetcher);
		await cache.get('id2', '/x', fetcher);
		expect(calls).toBe(3);

		cache.invalidate('id1');

		await cache.get('id1', '/x', fetcher); // re-fetch
		await cache.get('id1', '/y', fetcher); // re-fetch
		await cache.get('id2', '/x', fetcher); // still cached
		expect(calls).toBe(5);
	});
});
