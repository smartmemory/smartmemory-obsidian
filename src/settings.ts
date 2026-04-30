import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type SmartMemoryPlugin from './main';

const TEXT_DEBOUNCE_MS = 500;

export class SmartMemorySettingTab extends PluginSettingTab {
	plugin: SmartMemoryPlugin;
	private saveTimer: ReturnType<typeof setTimeout> | null = null;
	/** Tracks an in-flight saveSettings() launched by the debounce timer
	 *  so flushPendingSave() can wait for it to complete before testing. */
	private inFlightSave: Promise<void> | null = null;

	constructor(app: App, plugin: SmartMemoryPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	hide(): void {
		// Flush any pending text debounce when leaving the settings tab
		if (this.saveTimer !== null) {
			clearTimeout(this.saveTimer);
			this.saveTimer = null;
			void this.plugin.saveSettings();
		}
	}

	private debouncedSave(): void {
		if (this.saveTimer !== null) clearTimeout(this.saveTimer);
		this.saveTimer = setTimeout(() => {
			this.saveTimer = null;
			this.inFlightSave = this.plugin.saveSettings().finally(() => {
				this.inFlightSave = null;
			});
		}, TEXT_DEBOUNCE_MS);
	}

	private async flushPendingSave(): Promise<void> {
		// Case 1: a debounce timer is queued — fire it now and await
		if (this.saveTimer !== null) {
			clearTimeout(this.saveTimer);
			this.saveTimer = null;
			this.inFlightSave = this.plugin.saveSettings().finally(() => {
				this.inFlightSave = null;
			});
		}
		// Case 2: a debounce-triggered save is already in-flight — await it
		if (this.inFlightSave) {
			await this.inFlightSave;
		}
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'SmartMemory' });

		const securityWarning = containerEl.createDiv({ cls: 'smartmemory-warning' });
		securityWarning.setText(
			'Your API key is stored locally in plaintext. If you sync your vault via git, ' +
			'add `.obsidian/plugins/smartmemory/data.json` to `.gitignore`.'
		);

		// Auth
		containerEl.createEl('h3', { text: 'Connection' });

		new Setting(containerEl)
			.setName('API URL')
			.setDesc('SmartMemory service endpoint')
			.addText(text => text
				.setPlaceholder('https://api.smartmemory.ai')
				.setValue(this.plugin.settings.apiUrl)
				.onChange((value) => {
					this.plugin.settings.apiUrl = value || 'https://api.smartmemory.ai';
					this.debouncedSave();
				}));

		new Setting(containerEl)
			.setName('API key')
			.setDesc('Generate from your SmartMemory web UI. Or set SMARTMEMORY_API_KEY env var.')
			.addText(text => {
				text.setPlaceholder('sm_...')
					.setValue(this.plugin.settings.apiKey)
					.onChange((value) => {
						this.plugin.settings.apiKey = value;
						this.debouncedSave();
					});
				// Mask the secret while editing
				text.inputEl.type = 'password';
				text.inputEl.autocomplete = 'off';
			});

		new Setting(containerEl)
			.setName('Workspace ID')
			.setDesc('SmartMemory workspace identifier (X-Workspace-Id header)')
			.addText(text => text
				.setValue(this.plugin.settings.workspaceId)
				.onChange((value) => {
					this.plugin.settings.workspaceId = value;
					this.debouncedSave();
				}));

		new Setting(containerEl)
			.setName('Test connection')
			.addButton(btn => btn
				.setButtonText('Test')
				.onClick(async () => {
					// Flush any pending debounced save so the client is reinitialized
					// against the freshly-edited settings before we test the connection.
					await this.flushPendingSave();
					const ok = await this.plugin.testConnection();
					new Notice(ok ? 'SmartMemory: connected' : 'SmartMemory: connection failed');
				}));

		// Ingest
		containerEl.createEl('h3', { text: 'Ingest' });

		new Setting(containerEl)
			.setName('Auto-ingest on save')
			.setDesc('Automatically ingest notes after editing (debounced)')
			.addToggle(t => t
				.setValue(this.plugin.settings.autoIngestOnSave)
				.onChange(async (v) => {
					this.plugin.settings.autoIngestOnSave = v;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto-ingest on create')
			.setDesc('Ingest new notes when created')
			.addToggle(t => t
				.setValue(this.plugin.settings.autoIngestOnCreate)
				.onChange(async (v) => {
					this.plugin.settings.autoIngestOnCreate = v;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Exclude folders')
			.setDesc('Comma-separated glob patterns to exclude from ingest')
			.addText(text => text
				.setValue(this.plugin.settings.excludeFolders.join(','))
				.onChange((value) => {
					this.plugin.settings.excludeFolders = value.split(',').map(s => s.trim()).filter(Boolean);
					this.debouncedSave();
				}));

		// Enrichment
		containerEl.createEl('h3', { text: 'Enrichment' });

		this.addToggle(containerEl, 'Write smartmemory_id', 'Adds the SmartMemory item ID to frontmatter (visible in published vaults)', 'writeFrontmatterId');
		this.addToggle(containerEl, 'Write entities', 'Add extracted entities to frontmatter', 'enrichEntities');
		this.addToggle(containerEl, 'Write relations', 'Add extracted relations to frontmatter', 'enrichRelations');
		this.addToggle(containerEl, 'Write memory type', 'Add memory type classification to frontmatter', 'enrichMemoryType');
		this.addToggle(containerEl, 'Write sync timestamp', 'Add last sync timestamp to frontmatter', 'enrichSyncTimestamp');

		// Suggestions
		containerEl.createEl('h3', { text: 'Inline Suggestions' });

		this.addToggle(containerEl, 'Enable inline suggestions', 'Show related-memory suggestions while typing (off by default)', 'inlineSuggestionsEnabled');

		new Setting(containerEl)
			.setName('Suggestion frequency')
			.setDesc('How aggressively to surface suggestions while typing')
			.addDropdown(d => d
				.addOption('aggressive', 'Aggressive (1s)')
				.addOption('balanced', 'Balanced (2s)')
				.addOption('minimal', 'Minimal (5s)')
				.setValue(this.plugin.settings.suggestionFrequency)
				.onChange(async (value) => {
					this.plugin.settings.suggestionFrequency = value as any;
					await this.plugin.saveSettings();
				}));

		// Contradiction detection
		containerEl.createEl('h3', { text: 'Contradiction Detection' });

		this.addToggle(containerEl, 'Show supersession banner', 'Warn when a note has been superseded', 'contradictionBannerEnabled');

		// Graph
		containerEl.createEl('h3', { text: 'Knowledge Graph' });

		new Setting(containerEl)
			.setName('Default hops')
			.setDesc('Default neighborhood depth for the graph pane')
			.addSlider(s => s
				.setLimits(1, 3, 1)
				.setValue(this.plugin.settings.graphDefaultHops)
				.setDynamicTooltip()
				.onChange(async (v) => {
					this.plugin.settings.graphDefaultHops = v;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Max nodes')
			.setDesc('Maximum nodes shown in the graph pane')
			.addText(text => text
				.setValue(String(this.plugin.settings.graphMaxNodes))
				.onChange((value) => {
					const n = parseInt(value, 10);
					if (!isNaN(n) && n > 0) {
						this.plugin.settings.graphMaxNodes = n;
						this.debouncedSave();
					}
				}));
	}

	private addToggle(
		containerEl: HTMLElement,
		name: string,
		desc: string,
		key: keyof typeof this.plugin.settings,
	): void {
		new Setting(containerEl)
			.setName(name)
			.setDesc(desc)
			.addToggle(t => t
				.setValue(this.plugin.settings[key] as boolean)
				.onChange(async (v) => {
					(this.plugin.settings as any)[key] = v;
					await this.plugin.saveSettings();
				}));
	}
}
