/**
 * Per-key debouncer. A new call with the same key resets that key's timer;
 * different keys have independent timers.
 */
export class KeyedDebouncer<K> {
	private timers = new Map<K, ReturnType<typeof setTimeout>>();

	constructor(private delayMs: number) {}

	schedule(key: K, fn: () => void): void {
		const existing = this.timers.get(key);
		if (existing !== undefined) clearTimeout(existing);
		const t = setTimeout(() => {
			this.timers.delete(key);
			fn();
		}, this.delayMs);
		this.timers.set(key, t);
	}

	cancel(key: K): void {
		const existing = this.timers.get(key);
		if (existing !== undefined) {
			clearTimeout(existing);
			this.timers.delete(key);
		}
	}

	cancelAll(): void {
		for (const t of this.timers.values()) clearTimeout(t);
		this.timers.clear();
	}
}
