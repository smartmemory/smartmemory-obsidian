import type { ConnectionStatus } from './types';

export interface StatusBarActions {
	onIngest?: () => void;
	onSearch?: () => void;
	onSettings?: () => void;
	onUpgrade?: () => void;
}

export class StatusBarController {
	private el: HTMLElement;
	private status: ConnectionStatus = 'disconnected';
	private memoryCount: number = 0;
	private memoryLimit: number | null = null;
	private lastSync: Date | null = null;
	private actions: StatusBarActions = {};

	constructor(el: HTMLElement) {
		this.el = el;
		this.el.addClass('smartmemory-status-bar');
		this.el.addEventListener('click', () => this.openMenu());
		this.render();
	}

	setActions(actions: StatusBarActions): void {
		this.actions = actions;
	}

	setStatus(status: ConnectionStatus): void {
		this.status = status;
		this.render();
	}

	setCount(count: number, limit: number | null = null): void {
		this.memoryCount = count;
		this.memoryLimit = limit;
		this.render();
	}

	setLastSync(date: Date): void {
		this.lastSync = date;
		this.render();
	}

	private openMenu(): void {
		// Simple toggle menu rendered as a popup attached to the status bar.
		// We avoid Obsidian's Menu API here to keep the footprint small;
		// host plugin can wire actions in via setActions().
		const existing = document.querySelector('.smartmemory-status-menu');
		if (existing) {
			existing.remove();
			return;
		}

		const menu = document.body.createDiv({ cls: 'smartmemory-status-menu' });
		const rect = this.el.getBoundingClientRect();
		menu.style.position = 'fixed';
		menu.style.bottom = `${window.innerHeight - rect.top + 4}px`;
		menu.style.right = `${window.innerWidth - rect.right}px`;

		const addItem = (label: string, fn?: () => void) => {
			if (!fn) return;
			const item = menu.createDiv({ cls: 'smartmemory-status-menu-item', text: label });
			item.addEventListener('click', () => {
				menu.remove();
				fn();
			});
		};

		addItem('Ingest current note', this.actions.onIngest);
		addItem('Search', this.actions.onSearch);
		addItem('Settings', this.actions.onSettings);
		if (this.memoryLimit !== null && this.memoryCount >= this.memoryLimit * 0.8) {
			addItem('Upgrade to remove free tier limit', this.actions.onUpgrade);
		}

		// Click outside to dismiss
		const dismiss = (evt: MouseEvent) => {
			if (!menu.contains(evt.target as Node) && evt.target !== this.el) {
				menu.remove();
				document.removeEventListener('click', dismiss, true);
			}
		};
		setTimeout(() => document.addEventListener('click', dismiss, true), 0);
	}

	private render(): void {
		this.el.empty();

		const dotColor = {
			connected: 'green',
			disconnected: 'red',
			syncing: 'orange',
		}[this.status];

		const dot = this.el.createSpan({ cls: 'smartmemory-status-dot' });
		dot.style.color = dotColor;
		dot.setText('●');

		const text = this.el.createSpan({ cls: 'smartmemory-status-text' });

		if (this.status === 'disconnected') {
			text.setText(' SmartMemory: disconnected');
			return;
		}

		const countDisplay = this.memoryLimit !== null
			? `${this.memoryCount}/${this.memoryLimit} (free tier)`
			: `${this.memoryCount} memories`;
		text.setText(` SmartMemory: ${countDisplay}`);

		if (this.lastSync) {
			const ago = formatRelativeTime(this.lastSync);
			this.el.createSpan({ cls: 'smartmemory-status-sync', text: ` · synced ${ago}` });
		}
	}
}

function formatRelativeTime(date: Date): string {
	const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
	if (seconds < 60) return 'just now';
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}
