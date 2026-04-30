import { Plugin } from 'obsidian';
import { SmartMemoryClient } from 'smartmemory-sdk-js/core';
import { createObsidianFetch } from './transport';
import { SmartMemorySettingTab } from './settings';
import { StatusBarController } from './status-bar';
import { MappingStore } from './bridge/mapping-store';
import { IngestService } from './services/ingest';
import { SearchService } from './services/search';
import { GraphCache } from './services/graph-cache';
import { ContradictionService } from './services/contradiction';
import { registerIngestCommands } from './commands/ingest';
import { registerSearchCommands } from './commands/search';
import { registerAutolinkCommand } from './commands/autolink';
import { SearchView, SEARCH_VIEW_TYPE } from './views/search-view';
import { EntityView, ENTITY_VIEW_TYPE } from './views/entity-view';
import { GraphView, GRAPH_VIEW_TYPE } from './views/graph-view';
import { ContradictionBanner } from './enrichers/contradiction';
import { InlineSuggestions } from './enrichers/suggestions';
import { VaultEvents } from './services/vault-events';
import { OnboardingModal, showFirstIngestTour } from './views/onboarding-modal';
import { DEFAULT_SETTINGS, EMPTY_MAPPINGS, SmartMemorySettings, PluginData } from './types';

export default class SmartMemoryPlugin extends Plugin {
	settings: SmartMemorySettings = DEFAULT_SETTINGS;
	client: SmartMemoryClient | null = null;
	statusBar: StatusBarController | null = null;
	mappingStore: MappingStore = new MappingStore({ ...EMPTY_MAPPINGS });
	ingestService: IngestService | null = null;
	searchService: SearchService | null = null;
	graphCache: GraphCache | null = null;
	contradictionService: ContradictionService | null = null;
	contradictionBanner: ContradictionBanner | null = null;
	inlineSuggestions: InlineSuggestions | null = null;
	/** Increments each time the client is reinitialized; used to discard stale async results. */
	private clientGeneration = 0;

	async onload(): Promise<void> {
		await this.loadSettings();

		const statusEl = this.addStatusBarItem();
		this.statusBar = new StatusBarController(statusEl);
		this.statusBar.setActions({
			onIngest: () => this.runCommand('smartmemory-ingest-current-note'),
			onSearch: () => this.runCommand('smartmemory-open-search'),
			onSettings: () => (this.app as any).setting?.open?.(),
			onUpgrade: () => window.open('https://app.smartmemory.ai/billing', '_blank'),
		});

		this.addSettingTab(new SmartMemorySettingTab(this.app, this));

		this.initClient();
		registerIngestCommands(this);
		registerSearchCommands(this);
		registerAutolinkCommand(this);

		this.contradictionBanner = new ContradictionBanner(this);
		this.contradictionBanner.start();

		this.inlineSuggestions = new InlineSuggestions(this);
		this.inlineSuggestions.start();

		new VaultEvents(this).register();

		// First-launch onboarding (deferred so workspace is ready)
		if (!this.settings.hasCompletedOnboarding) {
			this.app.workspace.onLayoutReady(() => {
				new OnboardingModal(this.app, this).open();
			});
		}

		this.registerView(SEARCH_VIEW_TYPE, (leaf) => new SearchView(leaf, this));
		this.registerView(ENTITY_VIEW_TYPE, (leaf) => new EntityView(leaf, this));
		this.registerView(GRAPH_VIEW_TYPE, (leaf) => new GraphView(leaf, this));

		this.addCommand({
			id: 'smartmemory-open-graph',
			name: 'Open knowledge graph pane',
			callback: async () => {
				const leaf = this.app.workspace.getLeaf();
				await leaf.setViewState({ type: GRAPH_VIEW_TYPE, active: true });
				this.app.workspace.revealLeaf(leaf);
			},
		});

		// Refresh side views when active note changes
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				for (const leaf of this.app.workspace.getLeavesOfType(ENTITY_VIEW_TYPE)) {
					const view = leaf.view;
					if (view instanceof EntityView) void view.refresh();
				}
				for (const leaf of this.app.workspace.getLeavesOfType(GRAPH_VIEW_TYPE)) {
					const view = leaf.view;
					if (view instanceof GraphView) void view.refresh();
				}
			})
		);

		// Connection test on load (non-blocking)
		this.testConnection().catch(() => {
			// Failure already reflected in status bar
		});
	}

	onunload(): void {
		this.client = null;
		this.statusBar = null;
		this.ingestService = null;
		this.searchService = null;
		this.graphCache = null;
		this.contradictionService = null;
		this.contradictionBanner = null;
		this.inlineSuggestions?.stop();
		this.inlineSuggestions = null;
	}

	private initClient(): void {
		this.clientGeneration += 1;
		const apiKey = this.resolveApiKey();
		if (!apiKey || !this.settings.apiUrl) {
			this.client = null;
			this.ingestService = null;
			this.searchService = null;
			this.graphCache = null;
			this.contradictionService = null;
			this.statusBar?.setStatus('disconnected');
			return;
		}

		this.client = new SmartMemoryClient({
			mode: 'apiKey',
			apiKey,
			apiBaseUrl: this.settings.apiUrl,
			fetchFn: createObsidianFetch(),
		});

		if (this.settings.workspaceId) {
			this.client.setTeamId(this.settings.workspaceId);
		}

		this.searchService = new SearchService(this.client);
		this.graphCache = new GraphCache(this.client);
		this.contradictionService = new ContradictionService(this.client);

		this.ingestService = new IngestService({
			client: this.client,
			app: this.app,
			mappingStore: this.mappingStore,
			settings: this.settings,
			onEvent: (event) => {
				if (event.type === 'batch-progress') {
					this.statusBar?.setStatus('syncing');
				} else if (event.type === 'ingest-complete') {
					this.statusBar?.setLastSync(new Date());
					this.graphCache?.invalidate();
					showFirstIngestTour(this);
				} else if (event.type === 'enrichment-complete') {
					this.statusBar?.setLastSync(new Date());
					this.graphCache?.invalidate();
				}
			},
		});
	}

	/**
	 * Resolve API key with env var override.
	 * SMARTMEMORY_API_KEY > settings.apiKey
	 */
	private resolveApiKey(): string {
		const envKey = (typeof process !== 'undefined' && process.env?.SMARTMEMORY_API_KEY) || '';
		return envKey || this.settings.apiKey;
	}

	async testConnection(): Promise<boolean> {
		const generation = this.clientGeneration;
		const client = this.client;
		if (!client) {
			this.statusBar?.setStatus('disconnected');
			return false;
		}
		try {
			this.statusBar?.setStatus('syncing');
			const result = await client.memories.list({ limit: 1 });
			// Discard if a settings change reinitialized the client during the await
			if (generation !== this.clientGeneration) return false;
			this.statusBar?.setStatus('connected');
			this.statusBar?.setCount(result.total || 0);
			this.statusBar?.setLastSync(new Date());
			return true;
		} catch (err) {
			if (generation !== this.clientGeneration) return false;
			this.statusBar?.setStatus('disconnected');
			return false;
		}
	}

	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as PluginData | null;
		this.settings = { ...DEFAULT_SETTINGS, ...(data?.settings || {}) };
		this.mappingStore = new MappingStore(data?.mappings || EMPTY_MAPPINGS);
	}

	async saveSettings(): Promise<void> {
		const data: PluginData = {
			settings: this.settings,
			mappings: this.mappingStore.toJSON(),
		};
		await this.saveData(data);
		// Reinitialize client when settings change (auth, URL, workspace)
		this.initClient();
		// Forward to runtime singletons
		this.ingestService?.updateSettings?.(this.settings);
		this.inlineSuggestions?.updateSettings();
	}

	private runCommand(commandId: string): void {
		// Obsidian's commands API is on app.commands, but the public types don't
		// expose executeCommandById; we go via the internal API which is stable
		// across versions used by community plugins.
		(this.app as any).commands?.executeCommandById?.(`${this.manifest.id}:${commandId}`)
			|| (this.app as any).commands?.executeCommandById?.(commandId);
	}

	async saveMappings(): Promise<void> {
		const data: PluginData = {
			settings: this.settings,
			mappings: this.mappingStore.toJSON(),
		};
		await this.saveData(data);
	}
}
