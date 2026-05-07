import { ItemView, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GraphExplorer } from '@smartmemory/graph';
import { createSDKAdapter } from '@smartmemory/graph/src/adapters/sdkAdapter';
import type SmartMemoryPlugin from '../main';
import { readSmartMemoryId } from '../bridge/frontmatter';

export const GRAPH_VIEW_TYPE = 'smartmemory-graph';

/**
 * Obsidian ItemView shell that mounts the shared @smartmemory/graph
 * GraphExplorer React component.
 *
 * The plugin previously rolled its own Cytoscape integration (BFS, field
 * normalization, layout, styles, all custom). That duplicated the work
 * already shipped in @smartmemory/graph and used by the web/studio
 * frontends. The adoption uses the canonical adapter+component path so
 * future graph fixes (color contracts, structural-vs-extracted edge
 * styling, supersession overlays, contradiction highlighting) propagate
 * to all SmartMemory frontends from one source.
 */
export class GraphView extends ItemView {
	private plugin: SmartMemoryPlugin;
	private rootEl: HTMLElement | null = null;
	private reactRoot: Root | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: SmartMemoryPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string { return GRAPH_VIEW_TYPE; }
	getDisplayText(): string { return 'SmartMemory graph'; }
	getIcon(): string { return 'git-branch'; }

	async onOpen(): Promise<void> {
		this.rootEl = this.containerEl.children[1] as HTMLElement;
		this.rootEl.empty();
		// Tailwind utilities ship under .smartmemory-graph-view; the wrapper
		// is required for the GraphExplorer subtree to pick them up.
		this.rootEl.addClass('smartmemory-graph-view');
		// Force the wrapper to behave as a flex column with definite height so
		// GraphExplorer's `h-full w-full` and CytoscapeCanvas's `flex-1` can
		// resolve to non-zero pixel dimensions. Without these, cose-bilkent
		// runs against a 0×0 container and every node settles at (0, 0).
		this.rootEl.style.display = 'flex';
		this.rootEl.style.flexDirection = 'column';
		this.rootEl.style.height = '100%';
		this.rootEl.style.width = '100%';
		this.rootEl.style.padding = '0';

		const mount = this.rootEl.createDiv({ cls: 'smartmemory-graph-mount' });
		mount.style.flex = '1 1 auto';
		mount.style.minHeight = '0';
		mount.style.display = 'flex';
		mount.style.flexDirection = 'column';
		mount.style.width = '100%';

		this.reactRoot = createRoot(mount);
		this.render();

		// Re-render on active-leaf-change so the focus node tracks the user.
		this.registerEvent(
			this.plugin.app.workspace.on('active-leaf-change', () => this.render()),
		);

		// Re-render when Obsidian's color scheme toggles. `css-change` fires
		// for both the Obsidian theme switcher and OS-level light/dark
		// changes that propagate through Obsidian — it's the canonical hook.
		this.registerEvent(
			this.plugin.app.workspace.on('css-change', () => this.render()),
		);
	}

	/**
	 * Build a theme object from Obsidian's live CSS variables. This is
	 * the same data path Obsidian's own native graph view uses, so the
	 * embedded @smartmemory/graph viewer adopts whatever theme the user
	 * has loaded (default dark/light, Minimal, Things, AnuPpuccin, etc.)
	 * with no further mapping.
	 *
	 * `--graph-node`, `--graph-line`, `--graph-text` are the canonical
	 * graph-view variables. We fall back to `--text-muted` /
	 * `--background-modifier-border` / `--text-normal` for themes that
	 * skip the graph-specific tokens. `getComputedStyle` resolves the
	 * variables in their current cascaded form, so a community-theme
	 * accent or a user CSS snippet flows through automatically.
	 *
	 * Other consumers of @smartmemory/graph (web/studio/insights) pass
	 * no `theme` prop and render with the original semantic palette.
	 */
	private resolveTheme(): {
		mode: 'dark' | 'light';
		palette: { node: string; edge: string; label: string; labelOutline: string; selectionBorder: string };
	} {
		const isDark = document.body.classList.contains('theme-dark');
		const cs = getComputedStyle(document.body);
		const cssVar = (name: string, fallback: string): string => {
			const v = cs.getPropertyValue(name).trim();
			return v || fallback;
		};
		return {
			mode: isDark ? 'dark' : 'light',
			palette: {
				node: cssVar('--graph-node', cssVar('--text-muted', '#888')),
				edge: cssVar('--graph-line', cssVar('--background-modifier-border', '#666')),
				label: cssVar('--graph-text', cssVar('--text-normal', '#eee')),
				labelOutline: cssVar('--background-primary', isDark ? '#202020' : '#ffffff'),
				selectionBorder: cssVar('--interactive-accent', isDark ? '#a0a0a0' : '#202020'),
			},
		};
	}

	async onClose(): Promise<void> {
		this.reactRoot?.unmount();
		this.reactRoot = null;
	}

	private render(): void {
		if (!this.reactRoot) return;

		const client = this.plugin.client;
		if (!client) {
			this.reactRoot.render(
				createElement('div', { className: 'p-4 text-gray-400' },
					'Not connected. Configure API key in settings.'),
			);
			return;
		}

		const adapter = createSDKAdapter(client);
		const focusId = this.resolveFocusId();

		this.reactRoot.render(
			createElement(GraphExplorer, {
				adapter,
				theme: this.resolveTheme(),
				onNodeOpen: (node: any) => this.openVaultFileForNode(node),
				// Hide the selection toolbar (Move / Isolate / Delete) inside
				// Obsidian. The Delete action mutates SmartMemory across all
				// surfaces, which is the wrong destructive default for a
				// reader-first PKM context — users editing memories should
				// do so explicitly via plugin commands, not via a graph
				// click. Web and Studio still get the toolbar by default.
				hideSelectionToolbar: true,
				// Surface plugin-relevant streaming when SSE is wired in a
				// later iteration. For now the component falls back to plain
				// HTTP fetch via the adapter.
				className: 'h-full w-full',
				// Pass focusId via URL state would be ideal; for v1 we leave
				// it unset and let the user search/click into the graph.
				// (focusId integration tracked as a follow-up — see CHANGELOG.)
			} as any),
		);
		void focusId; // referenced for future hookup
	}

	private resolveFocusId(): string | null {
		const file = this.plugin.app.workspace.getActiveFile();
		if (!file) return null;
		return (
			this.plugin.mappingStore.getMemoryId(file.path)
			?? readSmartMemoryId(this.plugin.app, file)
		);
	}

	private async openVaultFileForNode(node: any): Promise<void> {
		const itemId: string | undefined = node?.id || node?.item_id;
		if (!itemId) {
			new Notice('SmartMemory: node has no id.');
			return;
		}
		const filePath = this.plugin.mappingStore.getFilePath(itemId);
		if (!filePath) {
			new Notice('SmartMemory: this node has no vault note.');
			return;
		}
		const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
		if (file instanceof TFile) {
			await this.plugin.app.workspace.getLeaf().openFile(file);
		}
	}
}
