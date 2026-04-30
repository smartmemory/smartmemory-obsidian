import { ItemView, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import cytoscape from 'cytoscape';
// @ts-ignore — no types available for cose-bilkent
import coseBilkent from 'cytoscape-cose-bilkent';
import type SmartMemoryPlugin from '../main';
import { extractNeighborhood, isStructuralEdge } from '../services/graph-bfs';
import { readSmartMemoryId } from '../bridge/frontmatter';
import colors from '../graph-colors.json';

if (typeof (cytoscape as any).__bilkentRegistered === 'undefined') {
	cytoscape.use(coseBilkent);
	(cytoscape as any).__bilkentRegistered = true;
}

export const GRAPH_VIEW_TYPE = 'smartmemory-graph';

export class GraphView extends ItemView {
	private plugin: SmartMemoryPlugin;
	private cy: cytoscape.Core | null = null;
	private rootEl: HTMLElement | null = null;
	private currentFocusId: string | null = null;

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
		this.rootEl.addClass('smartmemory-graph-view');

		const toolbar = this.rootEl.createDiv({ cls: 'smartmemory-graph-toolbar' });
		toolbar.createSpan({ cls: 'smartmemory-graph-title', text: 'SmartMemory graph' });
		const refreshBtn = toolbar.createEl('button', { text: 'Refresh' });
		refreshBtn.addEventListener('click', () => void this.refresh(true));

		const cyEl = this.rootEl.createDiv({ cls: 'smartmemory-graph-canvas' });
		cyEl.style.width = '100%';
		cyEl.style.height = 'calc(100% - 40px)';
		cyEl.style.minHeight = '400px';

		this.cy = cytoscape({
			container: cyEl,
			style: this.cytoscapeStyle(),
			layout: { name: 'cose-bilkent', animate: false } as any,
		});

		this.cy.on('tap', 'node', (evt) => {
			const id = evt.target.id();
			void this.onNodeTap(id);
		});

		await this.refresh();
	}

	async refresh(force = false): Promise<void> {
		const graphCache = this.plugin.graphCache;
		if (!graphCache) {
			this.showMessage('Not connected.');
			return;
		}

		const file = this.plugin.app.workspace.getActiveFile();
		const focusId = file
			? (this.plugin.mappingStore.getMemoryId(file.path) ?? readSmartMemoryId(this.plugin.app, file))
			: null;

		try {
			const fullGraph = await graphCache.get(force);
			const subgraph = focusId
				? extractNeighborhood(fullGraph, focusId, {
						hops: this.plugin.settings.graphDefaultHops,
						maxNodes: this.plugin.settings.graphMaxNodes,
					})
				: { nodes: fullGraph.nodes.slice(0, this.plugin.settings.graphMaxNodes), edges: [] };

			this.currentFocusId = focusId;
			this.renderGraph(subgraph.nodes, subgraph.edges, focusId);
		} catch (err) {
			this.showMessage(`Failed to load graph: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	async onClose(): Promise<void> {
		this.cy?.destroy();
		this.cy = null;
	}

	private renderGraph(nodes: any[], edges: any[], focusId: string | null): void {
		if (!this.cy) return;
		this.cy.elements().remove();

		const cyNodes = nodes.map(n => ({
			data: {
				id: n.id,
				label: truncate(n.label || n.content || n.id, 30),
				color: nodeColor(n),
				isFocus: n.id === focusId,
			},
		}));

		const cyEdges = edges.map((e, i) => ({
			data: {
				id: `e-${i}-${e.source}-${e.target}`,
				source: e.source,
				target: e.target,
				structural: isStructuralEdge(e.type),
				type: e.type || '',
			},
		}));

		this.cy.add([...cyNodes, ...cyEdges]);
		this.cy.layout({ name: 'cose-bilkent', animate: false } as any).run();
	}

	private async onNodeTap(itemId: string): Promise<void> {
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

	private showMessage(msg: string): void {
		if (!this.rootEl) return;
		this.rootEl.querySelectorAll('.smartmemory-graph-message').forEach(el => el.remove());
		this.rootEl.createDiv({ cls: 'smartmemory-graph-message', text: msg });
	}

	private cytoscapeStyle(): cytoscape.StylesheetCSS[] {
		return [
			{
				selector: 'node',
				style: {
					'background-color': 'data(color)',
					'label': 'data(label)',
					'text-valign': 'bottom',
					'text-halign': 'center',
					'font-size': '10px',
					'color': 'var(--text-normal)',
					'width': 30,
					'height': 30,
				},
			},
			{
				selector: 'node[?isFocus]',
				style: {
					'border-width': 3,
					'border-color': 'var(--interactive-accent)',
					'width': 40,
					'height': 40,
				},
			},
			{
				selector: 'edge',
				style: {
					'curve-style': 'bezier',
					'line-color': 'var(--text-faint)',
					'target-arrow-color': 'var(--text-faint)',
					'target-arrow-shape': 'triangle',
					'width': 1.5,
					'line-style': 'dashed',
				},
			},
			{
				selector: 'edge[?structural]',
				style: {
					'line-style': 'solid',
					'width': 2,
				},
			},
		] as any;
	}
}

function nodeColor(node: any): string {
	const memType = node.memory_type;
	if (memType && (colors.memoryTypes as any)[memType]) {
		return (colors.memoryTypes as any)[memType];
	}
	const entType = node.entity_type;
	if (entType && (colors.entityTypes as any)[entType]) {
		return (colors.entityTypes as any)[entType];
	}
	return colors.special.default;
}

function truncate(s: string, max: number): string {
	if (!s) return '';
	if (s.length <= max) return s;
	return s.slice(0, max - 1) + '…';
}
