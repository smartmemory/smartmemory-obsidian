import { App, Modal, Notice } from 'obsidian';
import type SmartMemoryPlugin from '../main';
import { LITE_DAEMON_URL } from '../types';

const SIGNUP_URL = 'https://app.smartmemory.ai/signup';
const LITE_INSTALL_URL = 'https://docs.smartmemory.ai/smartmemory/lite-daemon';

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

		// DIST-OBSIDIAN-LITE-1: Cloud / Local mode radio
		const modeWrap = contentEl.createDiv({ cls: 'smartmemory-onboarding-mode' });
		modeWrap.createEl('h3', { text: 'Where does your data live?' });
		const cloudLabel = modeWrap.createEl('label');
		const cloudInput = cloudLabel.createEl('input', { attr: { type: 'radio', name: 'sm-mode', value: 'cloud' } }) as HTMLInputElement;
		cloudInput.checked = this.plugin.settings.mode !== 'lite';
		cloudLabel.createSpan({ text: ' Cloud (hosted at api.smartmemory.ai)' });
		modeWrap.createEl('br');
		const liteLabel = modeWrap.createEl('label');
		const liteInput = liteLabel.createEl('input', { attr: { type: 'radio', name: 'sm-mode', value: 'lite' } }) as HTMLInputElement;
		liteInput.checked = this.plugin.settings.mode === 'lite';
		liteLabel.createSpan({ text: ' Local (lite — runs on this machine via smartmemory daemon)' });

		const paths = contentEl.createDiv({ cls: 'smartmemory-onboarding-paths' });
		const cloudPaths = paths.createDiv({ cls: 'smartmemory-onboarding-cloud' });
		const litePath = paths.createDiv({ cls: 'smartmemory-onboarding-lite' });
		litePath.createEl('h3', { text: 'Run SmartMemory locally' });
		litePath.createEl('p', {
			text: 'No account required. Install the daemon, start it, then open settings and connect.',
		});
		const liteCmd = litePath.createEl('pre');
		liteCmd.createEl('code', { text: 'pip install smartmemory && smartmemory daemon start' });
		const liteRow = litePath.createDiv({ cls: 'smartmemory-onboarding-lite-actions' });
		const liteDocsBtn = liteRow.createEl('button', { text: 'Read setup docs' });
		liteDocsBtn.addEventListener('click', () => window.open(LITE_INSTALL_URL, '_blank'));
		const liteOpenBtn = liteRow.createEl('button', { text: 'Connect to local daemon', cls: 'mod-cta' });
		liteOpenBtn.addEventListener('click', async () => {
			this.plugin.settings.mode = 'lite';
			this.plugin.settings.apiUrl = LITE_DAEMON_URL;
			// Persist mode + URL before opening settings so initClient() picks
			// up the new mode synchronously.
			await this.markComplete();
			(this.plugin.app as any).setting?.open?.();
			(this.plugin.app as any).setting?.openTabById?.(this.plugin.manifest.id);
			this.close();
		});

		const togglePaths = () => {
			const isLiteSelected = liteInput.checked;
			cloudPaths.style.display = isLiteSelected ? 'none' : '';
			litePath.style.display = isLiteSelected ? '' : 'none';
		};
		cloudInput.addEventListener('change', togglePaths);
		liteInput.addEventListener('change', togglePaths);
		togglePaths();

		const haveAccount = cloudPaths.createDiv({ cls: 'smartmemory-onboarding-path' });
		haveAccount.createEl('h3', { text: 'I have an account' });
		haveAccount.createEl('p', { text: 'Paste your API key to connect.' });
		const haveBtn = haveAccount.createEl('button', { text: 'Open settings', cls: 'mod-cta' });
		haveBtn.addEventListener('click', async () => {
			await this.markComplete();
			(this.plugin.app as any).setting?.open?.();
			(this.plugin.app as any).setting?.openTabById?.(this.plugin.manifest.id);
			this.close();
		});

		const newAccount = cloudPaths.createDiv({ cls: 'smartmemory-onboarding-path' });
		newAccount.createEl('h3', { text: 'Create a free account' });
		newAccount.createEl('p', { text: 'Sign up, generate an API key, paste it into settings.' });
		const newBtn = newAccount.createEl('button', { text: 'Open signup' });
		newBtn.addEventListener('click', async () => {
			window.open(SIGNUP_URL, '_blank');
			await this.markComplete();
			(this.plugin.app as any).setting?.open?.();
			(this.plugin.app as any).setting?.openTabById?.(this.plugin.manifest.id);
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
