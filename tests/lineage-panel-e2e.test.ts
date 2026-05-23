/**
 * LineagePanel E2E rendering tests — DIST-OBSIDIAN-E2E-1-BACKFILL.
 *
 * Mirrors the shape of decisions-panel-e2e.test.ts. Catches: SDK call
 * shape (`client.memories.getLineage(itemId)`), empty/loading/error states,
 * row rendering with memory_type + confidence + content + vault-link
 * surface, refresh-on-active-leaf-change.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LineagePanel } from '../src/views/lineage-panel';
import { panelHarness, fakeFile } from './harness/panel-harness';

describe('LineagePanel — E2E rendering', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('shows "No active note." when nothing is open', async () => {
		const h = panelHarness();
		const { rootEl } = await h.mount(LineagePanel);
		expect(rootEl.querySelector('.smartmemory-panel-empty')?.textContent).toBe('No active note.');
		expect(h.plugin.client.memories.getLineage).not.toHaveBeenCalled();
	});

	it('shows ingest hint when active note has no memory id', async () => {
		const h = panelHarness();
		const file = fakeFile('Inbox/Untracked.md');
		h.setActiveFile(file);
		const { rootEl } = await h.mount(LineagePanel);
		expect(rootEl.querySelector('.smartmemory-panel-empty')?.textContent).toContain(
			'not been ingested',
		);
		expect(h.plugin.client.memories.getLineage).not.toHaveBeenCalled();
	});

	it('calls client.memories.getLineage with the active file memory id', async () => {
		const h = panelHarness();
		const file = fakeFile('Notes/origin.md');
		h.setActiveFile(file);
		h.setMemoryId(file.path, 'mem-origin');

		await h.mount(LineagePanel);

		expect(h.plugin.client.memories.getLineage).toHaveBeenCalledTimes(1);
		expect(h.plugin.client.memories.getLineage.mock.calls[0][0]).toBe('mem-origin');
	});

	it('renders empty state when server returns zero lineage items', async () => {
		const h = panelHarness({
			memories: { getLineage: vi.fn().mockResolvedValue({ lineage: [], depth: 0 }) },
		});
		const file = fakeFile('Notes/lonely.md');
		h.setActiveFile(file);
		h.setMemoryId(file.path, 'mem-lonely');

		const { rootEl } = await h.mount(LineagePanel);
		expect(rootEl.querySelector('.smartmemory-panel-empty')?.textContent).toContain(
			'No derivation history',
		);
	});

	it('renders one li per lineage item with memory_type pill and confidence', async () => {
		const h = panelHarness({
			memories: {
				getLineage: vi.fn().mockResolvedValue({
					lineage: [
						{ item_id: 'A', memory_type: 'semantic', confidence: 0.91, content: 'A says X' },
						{ item_id: 'B', memory_type: 'episodic', confidence: 0.42, content: 'B notes Y' },
						{ item_id: 'C', memory_type: 'semantic', content: 'C with no confidence' },
					],
					depth: 3,
				}),
			},
		});
		const file = fakeFile('Notes/chain.md');
		h.setActiveFile(file);
		h.setMemoryId(file.path, 'mem-chain');

		const { rootEl } = await h.mount(LineagePanel);

		const items = rootEl.querySelectorAll('.smartmemory-lineage-list > li');
		expect(items).toHaveLength(3);

		// Header info line includes count and depth
		expect(rootEl.querySelector('.smartmemory-lineage-info')?.textContent).toContain('3 items');
		expect(rootEl.querySelector('.smartmemory-lineage-info')?.textContent).toContain('depth 3');

		// First two have confidence chip, third doesn't
		expect(items[0].querySelector('.smartmemory-lineage-confidence')?.textContent).toBe('conf 0.91');
		expect(items[1].querySelector('.smartmemory-lineage-confidence')?.textContent).toBe('conf 0.42');
		expect(items[2].querySelector('.smartmemory-lineage-confidence')).toBeNull();

		// memory_type pill
		expect(items[0].querySelector('.smartmemory-search-type')?.textContent).toBe('semantic');
		expect(items[1].querySelector('.smartmemory-search-type')?.textContent).toBe('episodic');

		// content snippet
		expect(items[0].querySelector('.smartmemory-search-snippet')?.textContent).toBe('A says X');
	});

	it('shows "Open vault note" link only when mappingStore has a path for the item_id', async () => {
		const h = panelHarness({
			memories: {
				getLineage: vi.fn().mockResolvedValue({
					lineage: [
						{ item_id: 'A', memory_type: 'semantic', content: 'has file' },
						{ item_id: 'B', memory_type: 'semantic', content: 'no file' },
					],
				}),
			},
		});
		const file = fakeFile('Notes/x.md');
		h.setActiveFile(file);
		h.setMemoryId(file.path, 'mem-x');

		// Override mappingStore.getFilePath to surface a path for A only.
		h.plugin.mappingStore.getFilePath = (id: string) => (id === 'A' ? 'Notes/a.md' : null);

		const { rootEl } = await h.mount(LineagePanel);
		const items = rootEl.querySelectorAll('.smartmemory-lineage-list > li');
		expect(items[0].querySelector('a')?.textContent).toBe('Open vault note');
		expect(items[1].querySelector('a')).toBeNull();
	});

	it('renders error state with retry button when the fetch rejects', async () => {
		const h = panelHarness({
			memories: { getLineage: vi.fn().mockRejectedValue(new Error('lineage fail')) },
		});
		const file = fakeFile('Notes/err.md');
		h.setActiveFile(file);
		h.setMemoryId(file.path, 'mem-err');

		const { rootEl } = await h.mount(LineagePanel);
		const err = rootEl.querySelector('.smartmemory-panel-error');
		expect(err?.textContent).toContain('lineage fail');
		expect(err?.querySelector('button')?.textContent).toBe('Retry');
	});

	it('re-fetches with the new memory id when active-leaf-change fires', async () => {
		const h = panelHarness();
		const file1 = fakeFile('Notes/a.md');
		const file2 = fakeFile('Notes/b.md');
		h.setActiveFile(file1);
		h.setMemoryId(file1.path, 'mem-a');
		h.setMemoryId(file2.path, 'mem-b');

		const { fireLeafChange } = await h.mount(LineagePanel);
		expect(h.plugin.client.memories.getLineage).toHaveBeenCalledWith('mem-a');

		h.setActiveFile(file2);
		await fireLeafChange();
		expect(h.plugin.client.memories.getLineage).toHaveBeenCalledWith('mem-b');
		expect(h.plugin.client.memories.getLineage).toHaveBeenCalledTimes(2);
	});
});
