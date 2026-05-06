import { ItemView, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import cytoscape from 'cytoscape';
import type SmartMemoryPlugin from '../main';
import { extractNeighborhood, isStructuralEdge } from '../services/graph-bfs';
import { readSmartMemoryId } from '../bridge/frontmatter';
import colors from '../graph-colors.json';

// Built-in `cose` layout ships with cytoscape core — no extension registration
// required. We previously used `cose-bilkent` but its registration via
// `cytoscape.use()` was unreliable under Obsidian's bundled Electron renderer,
// causing silent fallback to the default grid layout.
const FORCE_LAYOUT = {
	name: 'cose',
	animate: false,
	idealEdgeLength: 120,
	nodeOverlap: 12,
	padding: 24,
	componentSpacing: 80,
	nodeRepulsion: 8000,
	edgeElasticity: 100,
	nestingFactor: 5,
	gravity: 80,
	numIter: 1000,
	fit: true,
} as any;

export const GRAPH_VIEW_TYPE = 'smartmemory-graph';

export class GraphView extends ItemView {
	private plugin: SmartMemoryPlugin;
	private cy: cytoscape.Core | null = null;
	private rootEl: HTMLElement | null = null;
	private currentFocusId: string | null = null;
	private refreshSeq = 0;

	constructor(leaf: WorkspaceLeaf, plugin: SmartMemoryPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string { return GRAPH_VIEW_TYPE; }
	getDisplayText(): string { return 'SmartMemory graph'; }
	getIcon(): string { return 'git-branch'; }

	async onOpen(): Promise<void> {
		console.log('[smartmemory-graph] onOpen FIRED');
		new Notice('SmartMemory graph: onOpen fired (build B)');

		this.rootEl = this.containerEl.children[1] as HTMLElement;
		this.rootEl.empty();
		this.rootEl.addClass('smartmemory-graph-view');

		const toolbar = this.rootEl.createDiv({ cls: 'smartmemory-graph-toolbar' });
		toolbar.createSpan({ cls: 'smartmemory-graph-title', text: 'SmartMemory graph (build B)' });
		const refreshBtn = toolbar.createEl('button', { text: 'Refresh' });
		refreshBtn.addEventListener('click', () => void this.refresh(true));

		const cyEl = this.rootEl.createDiv({ cls: 'smartmemory-graph-canvas' });
		cyEl.style.width = '100%';
		cyEl.style.height = 'calc(100% - 40px)';
		cyEl.style.minHeight = '400px';

		this.cy = cytoscape({
			container: cyEl,
			style: this.cytoscapeStyle(),
			layout: FORCE_LAYOUT,
		});

		this.cy.on('tap', 'node', (evt) => {
			const id = evt.target.id();
			void this.onNodeTap(id);
		});

		await this.refresh();
	}

	async refresh(force = false): Promise<void> {
		console.log('[smartmemory-graph] refresh CALLED', { force });
		const seq = ++this.refreshSeq;
		const graphCache = this.plugin.graphCache;
		if (!graphCache) {
			console.log('[smartmemory-graph] refresh ABORTED — no graphCache (client not configured?)');
			this.showMessage('Not connected.');
			return;
		}

		const file = this.plugin.app.workspace.getActiveFile();
		const focusId = file
			? (this.plugin.mappingStore.getMemoryId(file.path) ?? readSmartMemoryId(this.plugin.app, file))
			: null;

		try {
			const fullGraph = await graphCache.get(force);
			// Discard if a newer refresh started during the await — prevents
			// rapid leaf-changes from rendering stale neighborhoods.
			if (seq !== this.refreshSeq) return;

			console.log(
				'[smartmemory-graph] full-graph response',
				{ nodes: fullGraph.nodes?.length ?? 0, edges: fullGraph.edges?.length ?? 0, focusId },
			);

			let subgraph: typeof fullGraph;
			if (focusId) {
				subgraph = extractNeighborhood(fullGraph, focusId, {
					hops: this.plugin.settings.graphDefaultHops,
					maxNodes: this.plugin.settings.graphMaxNodes,
				});
			} else {
				// No focus node — show a slice of the full graph and keep
				// every edge whose endpoints survived the slice. Previous
				// implementation hardcoded `edges: []`, which collapsed the
				// layout into a row/grid because cose has no springs to relax
				// against.
				const slicedNodes = fullGraph.nodes.slice(0, this.plugin.settings.graphMaxNodes);
				const includedIds = new Set(slicedNodes.map(n => n.id));
				const slicedEdges = fullGraph.edges.filter(
					e => includedIds.has(e.source) && includedIds.has(e.target),
				);
				subgraph = { nodes: slicedNodes, edges: slicedEdges };
			}

			this.currentFocusId = focusId;
			this.renderGraph(subgraph.nodes, subgraph.edges, focusId);
		} catch (err) {
			if (seq !== this.refreshSeq) return;
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
		console.log(
			'[smartmemory-graph] rendered',
			{ nodes: cyNodes.length, edges: cyEdges.length },
		);
		this.cy.layout(FORCE_LAYOUT).run();
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

	private cytoscapeStyle(): cytoscape.Stylesheet[] {
		return [
			{
				selector: 'node',
				style: {
					'background-color': 'data(color)',
					'label': 'data(label)',
					'text-valign': 'bottom',
					'text-halign': 'center',
					'text-margin-y': 4,
					'font-size': 10,
					'text-wrap': 'ellipsis',
					'text-max-width': 120,
					'color': '#d4d4d4',
					'width': 14,
					'height': 14,
				},
			},
			{
				selector: 'node[?isFocus]',
				style: {
					'border-width': 2,
					'border-color': '#7c3aed',
					'width': 22,
					'height': 22,
				},
			},
			{
				selector: 'edge',
				style: {
					'curve-style': 'bezier',
					'line-color': '#666',
					'target-arrow-color': '#666',
					'target-arrow-shape': 'triangle',
					'arrow-scale': 0.8,
					'width': 1,
					'line-style': 'dashed',
					'opacity': 0.7,
				},
			},
			{
				selector: 'edge[?structural]',
				style: {
					'line-style': 'solid',
					'width': 1.5,
				},
			},
		];
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
