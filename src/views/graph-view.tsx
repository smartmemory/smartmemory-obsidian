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

		const mount = this.rootEl.createDiv({ cls: 'smartmemory-graph-mount' });
		mount.style.width = '100%';
		mount.style.height = '100%';

		this.reactRoot = createRoot(mount);
		this.render();

		// Re-render on active-leaf-change so the focus node tracks the user.
		this.registerEvent(
			this.plugin.app.workspace.on('active-leaf-change', () => this.render()),
		);
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
				onNodeOpen: (node: any) => this.openVaultFileForNode(node),
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
