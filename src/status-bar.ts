import type { ConnectionStatus } from './types';

export class StatusBarController {
	private el: HTMLElement;
	private status: ConnectionStatus = 'disconnected';
	private memoryCount: number = 0;
	private memoryLimit: number | null = null;
	private lastSync: Date | null = null;

	constructor(el: HTMLElement) {
		this.el = el;
		this.el.addClass('smartmemory-status-bar');
		this.render();
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
