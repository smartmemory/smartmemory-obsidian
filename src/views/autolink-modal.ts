import { App, Modal, TFile, Notice } from 'obsidian';
import type { LinkProposal } from '../bridge/wikilinks';
import { applyLinkInsertions } from '../bridge/wikilinks';

export class AutolinkModal extends Modal {
	private file: TFile;
	private originalText: string;
	private proposals: LinkProposal[];
	private accepted: Set<number> = new Set();

	constructor(app: App, file: TFile, originalText: string, proposals: LinkProposal[]) {
		super(app);
		this.file = file;
		this.originalText = originalText;
		this.proposals = proposals;
		// Default: all selected
		for (let i = 0; i < proposals.length; i++) this.accepted.add(i);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('smartmemory-autolink-modal');

		contentEl.createEl('h2', {
			text: `Auto-link: ${this.proposals.length} proposed wikilink${this.proposals.length === 1 ? '' : 's'}`,
		});

		if (this.proposals.length === 0) {
			contentEl.createDiv({ text: 'No new entity mentions found in this note.' });
			const closeBtn = contentEl.createEl('button', { text: 'Close' });
			closeBtn.addEventListener('click', () => this.close());
			return;
		}

		const list = contentEl.createDiv({ cls: 'smartmemory-autolink-list' });
		this.proposals.forEach((p, i) => this.renderProposal(list, p, i));

		const actions = contentEl.createDiv({ cls: 'smartmemory-autolink-actions' });

		const allBtn = actions.createEl('button', { text: 'Accept all' });
		allBtn.addEventListener('click', () => {
			this.accepted = new Set(this.proposals.map((_, i) => i));
			this.applyAndClose();
		});

		const selectedBtn = actions.createEl('button', { text: 'Apply selected', cls: 'mod-cta' });
		selectedBtn.addEventListener('click', () => this.applyAndClose());

		const cancelBtn = actions.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderProposal(container: HTMLElement, p: LinkProposal, idx: number): void {
		const row = container.createDiv({ cls: 'smartmemory-autolink-row' });

		const checkbox = row.createEl('input', { type: 'checkbox' });
		checkbox.checked = true;
		checkbox.addEventListener('change', () => {
			if (checkbox.checked) this.accepted.add(idx);
			else this.accepted.delete(idx);
		});

		const preview = row.createDiv({ cls: 'smartmemory-autolink-preview' });

		const before = this.originalText.slice(Math.max(0, p.start - 30), p.start);
		const after = this.originalText.slice(p.end, p.end + 30);

		preview.createSpan({ cls: 'smartmemory-autolink-context', text: '…' + before });
		preview.createSpan({ cls: 'smartmemory-autolink-match', text: p.matchedText });
		preview.createSpan({ cls: 'smartmemory-autolink-arrow', text: ' → ' });
		preview.createSpan({ cls: 'smartmemory-autolink-target', text: `[[${p.target}]]` });
		preview.createSpan({ cls: 'smartmemory-autolink-context', text: after + '…' });
	}

	private async applyAndClose(): Promise<void> {
		const accepted = this.proposals.filter((_, i) => this.accepted.has(i));
		if (accepted.length === 0) {
			this.close();
			return;
		}
		const newText = applyLinkInsertions(this.originalText, accepted);
		await this.app.vault.modify(this.file, newText);
		new Notice(`SmartMemory: inserted ${accepted.length} wikilink${accepted.length === 1 ? '' : 's'}`);
		this.close();
	}
}
