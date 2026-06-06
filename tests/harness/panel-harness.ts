/**
 * Panel rendering test harness — DIST-OBSIDIAN-E2E-1 Tier 1.
 *
 * Mounts a `SmartMemoryPanelBase` subclass against jsdom with a fake
 * `SmartMemoryPlugin` whose client / mappingStore / app / panelCache are
 * test-controlled. Lets tests drive the full lifecycle (`onOpen`, refresh
 * on active-leaf-change, error path, empty path) and assert the resulting
 * DOM — the real exercise the per-pure-helper tests skip.
 *
 * Use:
 *
 *   const { mount, plugin, setActiveFile } = panelHarness({
 *     decisions: { list: vi.fn().mockResolvedValue({ decisions: [...], count: 1 }) },
 *   });
 *   const panel = await mount(DecisionsPanel);
 *   expect(panel.rootEl.querySelectorAll('.smartmemory-decision-row')).toHaveLength(1);
 *
 * Out of scope for Tier 1: real Obsidian Electron app, real Vault I/O,
 * real workspace leaves. Tier 2 (filed as separate ticket) covers those.
 */
import { vi } from 'vitest';
import { ItemView, TFile, WorkspaceLeaf, newDom } from '../__mocks__/obsidian';
import { PerIdCache } from '../../src/services/per-id-cache';

export interface FakeClient {
	decisions: {
		list: ReturnType<typeof vi.fn>;
	};
	memories: {
		// Method names match the runtime SDK (smart-memory-sdk-js MemoryAPI.js).
		// Earlier draft used `neighbors`/`lineage`; corrected 2026-05-23 when
		// the harness backfill caught LineagePanel silently no-op'ing in
		// production from a `lineage` typo bypassed by an `as any` cast.
		getNeighbors: ReturnType<typeof vi.fn>;
		getLineage: ReturnType<typeof vi.fn>;
	};
}

export interface FakePluginOverrides {
	decisions?: Partial<FakeClient['decisions']>;
	memories?: Partial<FakeClient['memories']>;
	getMemoryId?: (path: string) => string | null;
	settings?: Record<string, unknown>;
	/** DIST-OBSIDIAN-LITE-PARITY-1: drive capability-gated panel degradation.
	 *  Defaults to "everything available" so non-gated tests are unaffected. */
	capabilityAvailable?: (name: string) => boolean;
}

type LeafChangeHandler = () => void;

export interface PanelHarness {
	plugin: any;
	mount<T extends ItemView>(
		PanelClass: new (leaf: WorkspaceLeaf, plugin: any) => T,
	): Promise<{
		panel: T;
		rootEl: HTMLElement;
		fireLeafChange: () => Promise<void>;
		refresh: () => Promise<void>;
	}>;
	setActiveFile: (file: TFile | null) => void;
	setMemoryId: (path: string, id: string | null) => void;
}

/**
 * Build a panel test harness. Override any of the fake-client methods or
 * mapping-store behavior via the opts arg; everything else is wired with
 * sensible defaults.
 */
export function panelHarness(opts: FakePluginOverrides = {}): PanelHarness {
	const client: FakeClient = {
		decisions: {
			list: vi.fn().mockResolvedValue({ decisions: [], count: 0 }),
			...opts.decisions,
		},
		memories: {
			getNeighbors: vi.fn().mockResolvedValue({ neighbors: [], item_id: 'm1' }),
			getLineage: vi.fn().mockResolvedValue({ lineage: [], depth: 0 }),
			...opts.memories,
		},
	};

	let activeFile: TFile | null = null;
	const mappings = new Map<string, string | null>();
	const leafChangeHandlers: LeafChangeHandler[] = [];

	const setActiveFile = (file: TFile | null) => {
		activeFile = file;
	};

	const setMemoryId = (path: string, id: string | null) => {
		mappings.set(path, id);
	};

	const plugin: any = {
		client,
		settings: { apiUrl: 'http://localhost:9001', ...opts.settings },
		// Default-true mirrors the real plugin (unknown caps assumed available).
		capabilityAvailable: opts.capabilityAvailable ?? (() => true),
		mappingStore: {
			getMemoryId: (path: string) => {
				if (opts.getMemoryId) return opts.getMemoryId(path);
				return mappings.has(path) ? mappings.get(path)! : null;
			},
			getFilePath: (_id: string) => null,
		},
		panelCache: new PerIdCache(),
		app: {
			workspace: {
				on: (_event: string, handler: LeafChangeHandler) => {
					leafChangeHandlers.push(handler);
					return { __mock_ref: true };
				},
				getActiveFile: () => activeFile,
			},
			vault: {
				getAbstractFileByPath: () => null,
			},
			metadataCache: {
				// readSmartMemoryId() fallback when mappingStore returns null.
				// Tests that want to exercise frontmatter-driven id resolution
				// can replace this on the returned plugin.
				getFileCache: () => null,
			},
		},
	};

	async function mount<T extends ItemView>(
		PanelClass: new (leaf: WorkspaceLeaf, plugin: any) => T,
	) {
		const leaf = new WorkspaceLeaf();
		const panel = new PanelClass(leaf, plugin);

		// Reroute the panel's containerEl into a real DOM tree so test
		// assertions can `querySelector` against attached elements.
		const host = newDom();
		host.appendChild((panel as any).containerEl);

		await (panel as any).onOpen();

		const fireLeafChange = async () => {
			for (const h of leafChangeHandlers) await Promise.resolve(h());
			// onLeafChange triggers refresh(); refresh is async — let microtasks settle.
			await Promise.resolve();
			await Promise.resolve();
		};
		const refresh = async () => {
			await (panel as any).refresh();
		};

		return {
			panel,
			rootEl: (panel as any).rootEl as HTMLElement,
			fireLeafChange,
			refresh,
		};
	}

	return { plugin, mount, setActiveFile, setMemoryId };
}

/** Build a minimal TFile-like object for tests. */
export function fakeFile(path: string): TFile {
	const f = new TFile();
	f.path = path;
	f.basename = path.split('/').pop()?.replace(/\.md$/, '') ?? '';
	return f;
}
