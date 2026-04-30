import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SuggestionEngine, frequencyToDelayMs } from '../src/services/suggestions';
import { DEFAULT_SETTINGS } from '../src/types';

function makeSearch(results: any[] = []) {
	return {
		search: vi.fn().mockResolvedValue(results),
	} as any;
}

describe('frequencyToDelayMs', () => {
	it('returns 1000 for aggressive', () => expect(frequencyToDelayMs('aggressive')).toBe(1000));
	it('returns 2000 for balanced', () => expect(frequencyToDelayMs('balanced')).toBe(2000));
	it('returns 5000 for minimal', () => expect(frequencyToDelayMs('minimal')).toBe(5000));
});

describe('SuggestionEngine', () => {
	let search: any;
	let received: any[][];
	let engine: SuggestionEngine;

	beforeEach(() => {
		vi.useFakeTimers();
		received = [];
		search = makeSearch([
			{ itemId: 'a', content: 'related', memoryType: 'semantic', score: 0.9, snippet: 'related', origin: null, entities: [] },
		]);
		engine = new SuggestionEngine({
			search,
			settings: { ...DEFAULT_SETTINGS, inlineSuggestionsEnabled: true },
			onSuggestions: (results) => received.push(results),
		});
	});

	it('does not query when paragraph is too short', async () => {
		engine.queryDebounced('hi');
		await vi.advanceTimersByTimeAsync(5000);
		expect(search.search).not.toHaveBeenCalled();
	});

	it('debounces queries by configured frequency', async () => {
		engine.queryDebounced('this is a test paragraph for searching');
		await vi.advanceTimersByTimeAsync(1000);
		expect(search.search).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1500);
		expect(search.search).toHaveBeenCalledTimes(1);
	});

	it('cancels stale queries when new typing comes in', async () => {
		engine.queryDebounced('first paragraph long enough');
		await vi.advanceTimersByTimeAsync(1500);
		engine.queryDebounced('second paragraph long enough');
		await vi.advanceTimersByTimeAsync(2000);
		// Only the second query should fire (the first was cancelled by the new keystroke)
		expect(search.search).toHaveBeenCalledTimes(1);
		expect(search.search).toHaveBeenCalledWith(expect.objectContaining({
			query: 'second paragraph long enough',
		}));
	});

	it('discards stale results via sequence number', async () => {
		// Set up search to be slow
		let resolveFirst: (v: any) => void;
		const firstPromise = new Promise<any>(r => { resolveFirst = r; });
		search.search = vi.fn()
			.mockImplementationOnce(() => firstPromise)
			.mockResolvedValueOnce([{ itemId: 'fresh', content: 'x', memoryType: 'semantic', score: 0.9, snippet: '', origin: null, entities: [] }]);

		engine.queryDebounced('first paragraph long enough');
		await vi.advanceTimersByTimeAsync(2000);
		// First query is in-flight; trigger another
		engine.queryDebounced('second paragraph different');
		await vi.advanceTimersByTimeAsync(2000);
		// Resolve the first (stale) query
		resolveFirst!([{ itemId: 'stale', content: 'x', memoryType: 'semantic', score: 0.9, snippet: '', origin: null, entities: [] }]);
		await vi.runAllTimersAsync();

		// Only the fresh result should have been delivered
		expect(received.flat().every(r => r.itemId !== 'stale')).toBe(true);
	});

	it('filters out results below confidence threshold', async () => {
		search.search = vi.fn().mockResolvedValue([
			{ itemId: 'high', content: 'x', memoryType: 'semantic', score: 0.85, snippet: '', origin: null, entities: [] },
			{ itemId: 'low', content: 'x', memoryType: 'semantic', score: 0.4, snippet: '', origin: null, entities: [] },
		]);

		engine.queryDebounced('long enough paragraph here');
		await vi.advanceTimersByTimeAsync(2500);

		expect(received.length).toBeGreaterThan(0);
		const last = received[received.length - 1];
		expect(last.map(r => r.itemId)).toEqual(['high']);
	});

	it('does nothing when disabled in settings', async () => {
		engine.updateSettings({ ...DEFAULT_SETTINGS, inlineSuggestionsEnabled: false });
		engine.queryDebounced('long enough paragraph here');
		await vi.advanceTimersByTimeAsync(5000);
		expect(search.search).not.toHaveBeenCalled();
	});
});
