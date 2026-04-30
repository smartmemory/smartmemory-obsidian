import { Notice, Modal, App } from 'obsidian';

export const UPGRADE_URL = 'https://app.smartmemory.ai/billing';

/**
 * Examine an error from a SmartMemory API call and surface the right user
 * notice. Returns true if the error was a known quota/rate-limit problem
 * (so the caller knows it was handled and shouldn't show its own notice).
 */
export function handleQuotaError(app: App, err: unknown): boolean {
	const message = err instanceof Error ? err.message : String(err);
	const status = (err as any)?.status;

	if (status === 403 || message.includes('quota_exceeded')) {
		new UpgradeModal(app, 'Free tier note limit reached').open();
		return true;
	}
	if (status === 429 || message.includes('rate_limit')) {
		new Notice('SmartMemory: daily limit reached. Upgrade to continue.');
		return true;
	}
	return false;
}

class UpgradeModal extends Modal {
	private title: string;

	constructor(app: App, title: string) {
		super(app);
		this.title = title;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('smartmemory-upgrade-modal');
		contentEl.createEl('h2', { text: this.title });
		contentEl.createEl('p', {
			text: 'Upgrade your SmartMemory plan to ingest more notes, run unlimited searches, and unlock teams.',
		});

		const actions = contentEl.createDiv({ cls: 'smartmemory-upgrade-actions' });
		const upgradeBtn = actions.createEl('button', { text: 'Upgrade', cls: 'mod-cta' });
		upgradeBtn.addEventListener('click', () => {
			window.open(UPGRADE_URL, '_blank');
			this.close();
		});

		const dismissBtn = actions.createEl('button', { text: 'Dismiss' });
		dismissBtn.addEventListener('click', () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
