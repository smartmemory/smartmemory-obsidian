/**
 * SupersessionsPanel E2E rendering tests — DIST-OBSIDIAN-E2E-1-BACKFILL.
 *
 * Pure-helper coverage (`extractSupersessionRows`) lives in
 * supersessions-panel.test.ts. These tests exercise the panel as a whole —
 * SDK call shape (`client.memories.getNeighbors`), empty/error states, row
 * rendering, refresh-on-leaf-change.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SupersessionsPanel } from '../src/views/supersessions-panel';
import { panelHarness, fakeFile } from './harness/panel-harness';

describe('SupersessionsPanel — E2E rendering', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('shows "No active note." when nothing is open', async () => {
		const h = panelHarness();
		const { rootEl } = await h.mount(SupersessionsPanel);
		expect(rootEl.querySelector('.smartmemory-panel-empty')?.textContent).toBe('No active note.');
		expect(h.plugin.client.memories.getNeighbors).not.toHaveBeenCalled();
	});

	it('shows ingest hint when active note has no memory id', async () => {
		const h = panelHarness();
		const file = fakeFile('Inbox/Plain.md');
		h.setActiveFile(file);
		const { rootEl } = await h.mount(SupersessionsPanel);
		expect(rootEl.querySelector('.smartmemory-panel-empty')?.textContent).toContain(
			'not been ingested',
		);
		expect(h.plugin.client.memories.getNeighbors).not.toHaveBeenCalled();
	});

	it('calls client.memories.getNeighbors with the active file memory id', async () => {
		const h = panelHarness();
		const file = fakeFile('Notes/principle.md');
		h.setActiveFile(file);
		h.setMemoryId(file.path, 'mem-principle');

		await h.mount(SupersessionsPanel);

		expect(h.plugin.client.memories.getNeighbors).toHaveBeenCalledTimes(1);
		expect(h.plugin.client.memories.getNeighbors.mock.calls[0][0]).toBe('mem-principle');
	});

	it('renders empty state when no supersession edges exist', async () => {
		const h = panelHarness({
			memories: {
				getNeighbors: vi.fn().mockResolvedValue({
					neighbors: [
						// Other edge types only — extractSupersessionRows filters them out
						{ item_id: 'x', link_type: 'MENTIONS', direction: 'outgoing' },
					],
					item_id: 'mem-clean',
				}),
			},
		});
		const file = fakeFile('Notes/clean.md');
		h.setActiveFile(file);
		h.setMemoryId(file.path, 'mem-clean');

		const { rootEl } = await h.mount(SupersessionsPanel);
		expect(rootEl.querySelector('.smartmemory-panel-empty')?.textContent).toContain(
			'No supersession relationships',
		);
		expect(rootEl.querySelectorAll('.smartmemory-supersession-row')).toHaveLength(0);
	});

	it('renders supersedes + superseded rows with directional labels', async () => {
		const h = panelHarness({
			memories: {
				getNeighbors: vi.fn().mockResolvedValue({
					neighbors: [
						// I supersede the old one
						{
							item_id: 'old',
							content: 'older opinion',
							link_type: 'SUPERSEDES',
							direction: 'outgoing',
						},
						// And I am superseded by the newer one
						{
							item_id: 'new',
							content: 'newer opinion',
							link_type: 'SUPERSEDES',
							direction: 'incoming',
						},
					],
					item_id: 'mem-middle',
				}),
			},
		});
		const file = fakeFile('Notes/middle.md');
		h.setActiveFile(file);
		h.setMemoryId(file.path, 'mem-middle');

		const { rootEl } = await h.mount(SupersessionsPanel);

		const rows = rootEl.querySelectorAll('.smartmemory-supersession-row');
		expect(rows).toHaveLength(2);

		// Row order matches input order (extractSupersessionRows preserves it).
		const r0 = rows[0];
		expect(r0.querySelector('.smartmemory-supersession-supersedes')?.textContent).toBe(
			'supersedes',
		);
		expect(r0.querySelector('.smartmemory-supersession-snippet')?.textContent).toBe(
			'older opinion',
		);

		const r1 = rows[1];
		expect(r1.querySelector('.smartmemory-supersession-superseded')?.textContent).toBe(
			'is superseded by',
		);
		expect(r1.querySelector('.smartmemory-supersession-snippet')?.textContent).toBe(
			'newer opinion',
		);
	});

	it('truncates row snippets longer than 100 chars with ellipsis', async () => {
		const long = 'y'.repeat(250);
		const h = panelHarness({
			memories: {
				getNeighbors: vi.fn().mockResolvedValue({
					neighbors: [
						{ item_id: 'q', content: long, link_type: 'SUPERSEDES', direction: 'outgoing' },
					],
				}),
			},
		});
		const file = fakeFile('Notes/big.md');
		h.setActiveFile(file);
		h.setMemoryId(file.path, 'mem-big');

		const { rootEl } = await h.mount(SupersessionsPanel);
		const snippet = rootEl.querySelector('.smartmemory-supersession-snippet')?.textContent ?? '';
		expect(snippet.length).toBeLessThanOrEqual(105);
		expect(snippet.endsWith('…')).toBe(true);
	});

	it('renders error state with retry button when the fetch rejects', async () => {
		const h = panelHarness({
			memories: { getNeighbors: vi.fn().mockRejectedValue(new Error('neighbors fail')) },
		});
		const file = fakeFile('Notes/err.md');
		h.setActiveFile(file);
		h.setMemoryId(file.path, 'mem-err');

		const { rootEl } = await h.mount(SupersessionsPanel);
		const err = rootEl.querySelector('.smartmemory-panel-error');
		expect(err?.textContent).toContain('neighbors fail');
		expect(err?.querySelector('button')?.textContent).toBe('Retry');
	});

	it('re-fetches with the new memory id when active-leaf-change fires', async () => {
		const h = panelHarness();
		const file1 = fakeFile('Notes/a.md');
		const file2 = fakeFile('Notes/b.md');
		h.setActiveFile(file1);
		h.setMemoryId(file1.path, 'mem-a');
		h.setMemoryId(file2.path, 'mem-b');

		const { fireLeafChange } = await h.mount(SupersessionsPanel);
		expect(h.plugin.client.memories.getNeighbors).toHaveBeenCalledWith('mem-a');

		h.setActiveFile(file2);
		await fireLeafChange();
		expect(h.plugin.client.memories.getNeighbors).toHaveBeenCalledWith('mem-b');
		expect(h.plugin.client.memories.getNeighbors).toHaveBeenCalledTimes(2);
	});
});
