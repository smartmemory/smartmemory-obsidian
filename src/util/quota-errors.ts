import { Notice, Modal, App } from 'obsidian';

export const UPGRADE_URL = 'https://app.smartmemory.ai/billing';
export const SYNC_TO_CLOUD_URL = 'https://app.smartmemory.ai/signup?ref=obsidian-lite';

/**
 * Examine an error from a SmartMemory API call and surface the right user
 * notice. Returns true if the error was a known quota/rate-limit problem
 * (so the caller knows it was handled and shouldn't show its own notice).
 *
 * `isLite` (DIST-OBSIDIAN-LITE-1) reroutes the modal copy to a Sync-to-cloud
 * affordance. Lite daemons don't enforce quotas — these branches shouldn't
 * normally fire — but if a misconfigured or proxy-mode daemon ever does
 * surface a 429, we want it to nudge users toward the cloud rather than
 * confuse them with a billing page they have nothing to do with.
 */
export function handleQuotaError(app: App, err: unknown, opts: { isLite?: boolean } = {}): boolean {
	const message = err instanceof Error ? err.message : String(err);
	const errAny = err as any;
	const status = errAny?.status;
	const data = errAny?.data || {};
	const errorCode = data.error_code || errAny?.error_code;
	const detail = (data.detail || '').toString().toLowerCase();

	const isMemoryQuota =
		errorCode === 'quota_exceeded' ||
		message.includes('quota_exceeded') ||
		detail.includes('memory quota') ||
		(status === 403 && detail.includes('quota'));

	const isQueryQuota =
		errorCode === 'rate_limit' ||
		message.includes('rate_limit') ||
		detail.includes('query quota') ||
		detail.includes('daily query');

	if (isMemoryQuota) {
		openUpgradeModal(app, opts.isLite ?? false, 'Free tier note limit reached');
		return true;
	}
	if (isQueryQuota || status === 429) {
		if (opts.isLite) {
			new Notice('SmartMemory: rate limited. Sync to cloud for higher limits.');
		} else {
			new Notice('SmartMemory: daily limit reached. Upgrade to continue.');
		}
		return true;
	}
	return false;
}

/**
 * Open the upgrade modal — copy and primary action depend on lite vs cloud.
 * Exported so the status-bar quick-actions menu can trigger it directly.
 */
export function openUpgradeModal(app: App, isLite: boolean, titleOverride?: string): void {
	if (isLite) {
		new SyncToCloudModal(app, titleOverride ?? 'Sync your local SmartMemory to the cloud').open();
	} else {
		new UpgradeModal(app, titleOverride ?? 'Upgrade SmartMemory').open();
	}
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

/**
 * DIST-OBSIDIAN-LITE-1: lite-mode replacement for the upgrade modal. Pitches
 * cloud sync (backup + cross-device + teams) instead of a quota upgrade,
 * since lite has no quota to upgrade past.
 */
class SyncToCloudModal extends Modal {
	private title: string;

	constructor(app: App, title: string) {
		super(app);
		this.title = title;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('smartmemory-upgrade-modal');
		contentEl.addClass('smartmemory-sync-to-cloud-modal');
		contentEl.createEl('h2', { text: this.title });
		contentEl.createEl('p', {
			text: 'Your notes live on this machine. Sync to SmartMemory cloud to back them up, share with teammates, and access from any device.',
		});

		const actions = contentEl.createDiv({ cls: 'smartmemory-upgrade-actions' });
		const syncBtn = actions.createEl('button', { text: 'Sync to cloud', cls: 'mod-cta' });
		syncBtn.addEventListener('click', () => {
			window.open(SYNC_TO_CLOUD_URL, '_blank');
			this.close();
		});

		const dismissBtn = actions.createEl('button', { text: 'Dismiss' });
		dismissBtn.addEventListener('click', () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
