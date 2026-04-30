import { App, Modal, Notice } from 'obsidian';
import type SmartMemoryPlugin from '../main';

const SIGNUP_URL = 'https://app.smartmemory.ai/signup';

export class OnboardingModal extends Modal {
	private plugin: SmartMemoryPlugin;

	constructor(app: App, plugin: SmartMemoryPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('smartmemory-onboarding-modal');

		contentEl.createEl('h1', { text: 'Welcome to SmartMemory' });
		contentEl.createEl('p', {
			text: 'SmartMemory adds AI memory features to your vault — entity extraction, graph reasoning, multi-hop search, and contradiction detection. Pick how you want to start:',
		});

		const paths = contentEl.createDiv({ cls: 'smartmemory-onboarding-paths' });

		const haveAccount = paths.createDiv({ cls: 'smartmemory-onboarding-path' });
		haveAccount.createEl('h3', { text: 'I have an account' });
		haveAccount.createEl('p', { text: 'Paste your API key to connect.' });
		const haveBtn = haveAccount.createEl('button', { text: 'Open settings', cls: 'mod-cta' });
		haveBtn.addEventListener('click', () => {
			(this.plugin.app as any).setting?.open?.();
			(this.plugin.app as any).setting?.openTabById?.(this.plugin.manifest.id);
			void this.markComplete();
			this.close();
		});

		const newAccount = paths.createDiv({ cls: 'smartmemory-onboarding-path' });
		newAccount.createEl('h3', { text: 'Create a free account' });
		newAccount.createEl('p', { text: 'Sign up, generate an API key, paste it into settings.' });
		const newBtn = newAccount.createEl('button', { text: 'Open signup' });
		newBtn.addEventListener('click', () => {
			window.open(SIGNUP_URL, '_blank');
			(this.plugin.app as any).setting?.open?.();
			(this.plugin.app as any).setting?.openTabById?.(this.plugin.manifest.id);
			void this.markComplete();
			this.close();
		});

		const skip = contentEl.createDiv({ cls: 'smartmemory-onboarding-skip' });
		const skipLink = skip.createEl('a', { text: "I'll set this up later" });
		skipLink.addEventListener('click', () => {
			void this.markComplete();
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async markComplete(): Promise<void> {
		this.plugin.settings.hasCompletedOnboarding = true;
		await this.plugin.saveSettings();
	}
}

export function showFirstIngestTour(plugin: SmartMemoryPlugin): void {
	if (plugin.settings.hasSeenIngestTour) return;
	new Notice(
		'SmartMemory: this note is now ingested. Open the search sidebar (Ctrl/Cmd-P → "SmartMemory: Open search") and try a search.',
		8000,
	);
	plugin.settings.hasSeenIngestTour = true;
	void plugin.saveSettings();
}
