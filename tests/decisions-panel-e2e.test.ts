/**
 * DecisionsPanel E2E rendering tests — DIST-OBSIDIAN-E2E-1 Tier 1.
 *
 * Mounts DecisionsPanel against a jsdom DOM with a fake plugin/client and
 * asserts the actual rendered HTML — not just pure helpers. Catches:
 *   - SDK call shape (`client.decisions.list({ provenance_memory_id })`)
 *   - Empty / loading / error state rendering
 *   - Row content correctness (status pill, snippet, meta, decision_id)
 *   - Refresh-on-active-leaf-change behavior
 *   - No-active-file / no-memory-id messaging
 *
 * Pure helpers stay in decisions-panel.test.ts (formatCreatedAt unit tests).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DecisionsPanel } from '../src/views/decisions-panel';
import { panelHarness, fakeFile } from './harness/panel-harness';

describe('DecisionsPanel — E2E rendering', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('shows "No active note." when nothing is open', async () => {
		const h = panelHarness();
		// Default: no active file set
		const { rootEl } = await h.mount(DecisionsPanel);
		expect(rootEl.querySelector('.smartmemory-panel-empty')?.textContent).toBe('No active note.');
		// API must NOT have been called when there is no file
		expect(h.plugin.client.decisions.list).not.toHaveBeenCalled();
	});

	it('shows ingest hint when active note has no memory id', async () => {
		const h = panelHarness();
		const file = fakeFile('Inbox/Uningested.md');
		h.setActiveFile(file);
		// Deliberately do NOT call setMemoryId — mappingStore returns null,
		// frontmatter fallback returns null too (default metadataCache mock).
		const { rootEl } = await h.mount(DecisionsPanel);
		const empty = rootEl.querySelector('.smartmemory-panel-empty');
		expect(empty?.textContent).toContain('not been ingested');
		expect(h.plugin.client.decisions.list).not.toHaveBeenCalled();
	});

	it('calls client.decisions.list with provenance_memory_id derived from active file', async () => {
		const h = panelHarness();
		const file = fakeFile('Notes/cache-strategy.md');
		h.setActiveFile(file);
		h.setMemoryId(file.path, 'mem-cache-strategy');

		await h.mount(DecisionsPanel);

		expect(h.plugin.client.decisions.list).toHaveBeenCalledTimes(1);
		const calledWith = h.plugin.client.decisions.list.mock.calls[0][0];
		expect(calledWith.provenance_memory_id).toBe('mem-cache-strategy');
		expect(calledWith.limit).toBe(50);
	});

	it('renders empty state when server returns zero decisions', async () => {
		const h = panelHarness({
			decisions: { list: vi.fn().mockResolvedValue({ decisions: [], count: 0 }) },
		});
		const file = fakeFile('Notes/lonely.md');
		h.setActiveFile(file);
		h.setMemoryId(file.path, 'mem-lonely');

		const { rootEl } = await h.mount(DecisionsPanel);
		expect(rootEl.querySelector('.smartmemory-panel-empty')?.textContent).toContain(
			'No decisions derived from this note yet',
		);
		expect(rootEl.querySelectorAll('.smartmemory-decision-row')).toHaveLength(0);
	});

	it('renders one row per returned decision with status pill, snippet, decision id', async () => {
		const isoYesterday = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
		const h = panelHarness({
			decisions: {
				list: vi.fn().mockResolvedValue({
					decisions: [
						{
							decision_id: 'dec_aaaa',
							content: 'Use LRU caching for the hot path',
							status: 'active',
							confidence: 0.83,
							domain: 'perf',
							created_at: isoYesterday,
						},
						{
							decision_id: 'dec_bbbb',
							content: 'Skip Bloom filter — measured no win',
							status: 'superseded',
							confidence: 0.55,
							domain: 'perf',
							created_at: isoYesterday,
						},
					],
					count: 2,
				}),
			},
		});
		const file = fakeFile('Notes/perf.md');
		h.setActiveFile(file);
		h.setMemoryId(file.path, 'mem-perf');

		const { rootEl } = await h.mount(DecisionsPanel);

		const rows = rootEl.querySelectorAll('.smartmemory-decision-row');
		expect(rows).toHaveLength(2);

		// First row — active decision
		const first = rows[0];
		expect(first.querySelector('.smartmemory-decision-status-active')?.textContent).toBe('active');
		expect(first.querySelector('.smartmemory-decision-content')?.textContent).toContain('LRU caching');
		expect(first.querySelector('.smartmemory-decision-id')?.textContent).toBe('dec_aaaa');
		expect(first.querySelector('.smartmemory-decision-domain')?.textContent).toBe('perf');
		expect(first.querySelector('.smartmemory-decision-confidence')?.textContent).toBe('conf 0.83');

		// Second row — superseded decision (different status pill class)
		const second = rows[1];
		expect(second.querySelector('.smartmemory-decision-status-superseded')?.textContent).toBe(
			'superseded',
		);
		expect(second.querySelector('.smartmemory-decision-id')?.textContent).toBe('dec_bbbb');
	});

	it('renders error state with retry button when the fetch rejects', async () => {
		const h = panelHarness({
			decisions: {
				list: vi.fn().mockRejectedValue(new Error('network kaput')),
			},
		});
		const file = fakeFile('Notes/err.md');
		h.setActiveFile(file);
		h.setMemoryId(file.path, 'mem-err');

		const { rootEl } = await h.mount(DecisionsPanel);

		const err = rootEl.querySelector('.smartmemory-panel-error');
		expect(err?.textContent).toContain('network kaput');
		const retry = err?.querySelector('button');
		expect(retry?.textContent).toBe('Retry');
	});

	it('re-fetches with the new memory id when active-leaf-change fires', async () => {
		const h = panelHarness();
		const file1 = fakeFile('Notes/one.md');
		const file2 = fakeFile('Notes/two.md');
		h.setActiveFile(file1);
		h.setMemoryId(file1.path, 'mem-one');
		h.setMemoryId(file2.path, 'mem-two');

		const { fireLeafChange } = await h.mount(DecisionsPanel);

		expect(h.plugin.client.decisions.list).toHaveBeenCalledTimes(1);
		expect(h.plugin.client.decisions.list.mock.calls[0][0].provenance_memory_id).toBe('mem-one');

		// Simulate the user opening a different note in Obsidian.
		h.setActiveFile(file2);
		await fireLeafChange();

		expect(h.plugin.client.decisions.list).toHaveBeenCalledTimes(2);
		expect(h.plugin.client.decisions.list.mock.calls[1][0].provenance_memory_id).toBe('mem-two');
	});

	it('caches consecutive renders for the same id (panelCache hit)', async () => {
		const h = panelHarness();
		const file = fakeFile('Notes/same.md');
		h.setActiveFile(file);
		h.setMemoryId(file.path, 'mem-same');

		const { refresh } = await h.mount(DecisionsPanel);
		await refresh();
		await refresh();

		// All three renders against the same memory id => single network call.
		expect(h.plugin.client.decisions.list).toHaveBeenCalledTimes(1);
	});

	it('degrades to an explicit message (no fetch) when decisions capability is unavailable (lite mode)', async () => {
		const h = panelHarness({
			capabilityAvailable: (name) => name !== 'decisions',
		});
		const file = fakeFile('Notes/lite.md');
		h.setActiveFile(file);
		h.setMemoryId(file.path, 'mem-lite');

		const { rootEl } = await h.mount(DecisionsPanel);

		// Explicit degradation message, NOT an error or empty-list state.
		const empty = rootEl.querySelector('.smartmemory-panel-empty');
		expect(empty?.textContent).toContain('local (lite) mode');
		expect(rootEl.querySelector('.smartmemory-panel-error')).toBeNull();
		// Crucially: it must NOT call the unsupported endpoint (no silent 404).
		expect(h.plugin.client.decisions.list).not.toHaveBeenCalled();
	});

	it('still fetches decisions when the capability is available (cloud mode)', async () => {
		const h = panelHarness({
			capabilityAvailable: () => true,
			decisions: { list: vi.fn().mockResolvedValue({ decisions: [], count: 0 }) },
		});
		const file = fakeFile('Notes/cloud.md');
		h.setActiveFile(file);
		h.setMemoryId(file.path, 'mem-cloud');

		await h.mount(DecisionsPanel);
		expect(h.plugin.client.decisions.list).toHaveBeenCalledTimes(1);
	});

	it('truncates long decision content to ~120 chars with ellipsis', async () => {
		const long = 'x'.repeat(300);
		const h = panelHarness({
			decisions: {
				list: vi.fn().mockResolvedValue({
					decisions: [{ decision_id: 'dec_long', content: long, status: 'active' }],
					count: 1,
				}),
			},
		});
		const file = fakeFile('Notes/long.md');
		h.setActiveFile(file);
		h.setMemoryId(file.path, 'mem-long');

		const { rootEl } = await h.mount(DecisionsPanel);
		const snippet = rootEl.querySelector('.smartmemory-decision-content')?.textContent ?? '';
		expect(snippet.length).toBeLessThanOrEqual(125);
		expect(snippet.endsWith('…')).toBe(true);
	});
});
