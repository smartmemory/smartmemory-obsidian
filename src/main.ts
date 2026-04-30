import { Plugin } from 'obsidian';
import { SmartMemoryClient } from 'smartmemory-sdk-js/core';
import { createObsidianFetch } from './transport';
import { SmartMemorySettingTab } from './settings';
import { StatusBarController } from './status-bar';
import { DEFAULT_SETTINGS, EMPTY_MAPPINGS, SmartMemorySettings, PluginData } from './types';

export default class SmartMemoryPlugin extends Plugin {
	settings: SmartMemorySettings = DEFAULT_SETTINGS;
	client: SmartMemoryClient | null = null;
	statusBar: StatusBarController | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		const statusEl = this.addStatusBarItem();
		this.statusBar = new StatusBarController(statusEl);

		this.addSettingTab(new SmartMemorySettingTab(this.app, this));

		this.initClient();

		// Connection test on load (non-blocking)
		this.testConnection().catch(() => {
			// Failure already reflected in status bar
		});
	}

	onunload(): void {
		this.client = null;
		this.statusBar = null;
	}

	private initClient(): void {
		const apiKey = this.resolveApiKey();
		if (!apiKey || !this.settings.apiUrl) {
			this.client = null;
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
		if (!this.client) {
			this.statusBar?.setStatus('disconnected');
			return false;
		}
		try {
			this.statusBar?.setStatus('syncing');
			const result = await this.client.memories.list({ limit: 1 });
			this.statusBar?.setStatus('connected');
			this.statusBar?.setCount(result.total || 0);
			this.statusBar?.setLastSync(new Date());
			return true;
		} catch (err) {
			this.statusBar?.setStatus('disconnected');
			return false;
		}
	}

	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as PluginData | null;
		this.settings = { ...DEFAULT_SETTINGS, ...(data?.settings || {}) };
	}

	async saveSettings(): Promise<void> {
		const existing = (await this.loadData()) as PluginData | null;
		const data: PluginData = {
			settings: this.settings,
			mappings: existing?.mappings || EMPTY_MAPPINGS,
		};
		await this.saveData(data);
		// Reinitialize client when settings change (auth, URL, workspace)
		this.initClient();
	}
}
