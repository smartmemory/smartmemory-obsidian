/**
 * DIST-OBSIDIAN-PANELS-1 Phase 5: DecisionsPanel.
 *
 * Tests the pure `formatCreatedAt` helper. The view itself is thin DOM
 * glue around `client.decisions.list({ provenance_memory_id })` — the
 * fetch shape + scope guarantees live on the server side and are covered
 * by CORE-DECISION-PROVENANCE-LOOKUP-1's 12 parametrized parity tests +
 * 4 tenant-isolation tests. Here we only assert the panel's own glue.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { formatCreatedAt } from '../src/views/decisions-panel';

describe('formatCreatedAt', () => {
	// Freeze "now" so the relative-string assertions are deterministic.
	const FIXED_NOW = new Date('2026-05-23T12:00:00Z').getTime();

	beforeAll(() => {
		vi.useFakeTimers();
		vi.setSystemTime(FIXED_NOW);
	});
	afterAll(() => {
		vi.useRealTimers();
	});

	it('returns "today" for a timestamp within the last 24h', () => {
		expect(formatCreatedAt('2026-05-23T03:00:00Z')).toBe('today');
		expect(formatCreatedAt('2026-05-23T11:59:00Z')).toBe('today');
	});

	it('returns "yesterday" for ~1-day-old timestamp', () => {
		// 25h ago
		expect(formatCreatedAt('2026-05-22T11:00:00Z')).toBe('yesterday');
	});

	it('returns "Nd ago" for a 2-6 day window', () => {
		expect(formatCreatedAt('2026-05-19T12:00:00Z')).toBe('4d ago');
		expect(formatCreatedAt('2026-05-17T12:00:00Z')).toBe('6d ago');
	});

	it('falls back to absolute ISO-date for >=7 days old', () => {
		expect(formatCreatedAt('2026-05-15T12:00:00Z')).toBe('2026-05-15');
		expect(formatCreatedAt('2025-12-01T00:00:00Z')).toBe('2025-12-01');
	});

	it('passes through unparseable input verbatim (defensive)', () => {
		expect(formatCreatedAt('not-a-date')).toBe('not-a-date');
		expect(formatCreatedAt('')).toBe('');
	});
});
