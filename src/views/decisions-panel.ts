/**
 * DecisionsPanel — right-sidebar list of decisions derived from the active
 * note's memory.
 *
 * DIST-OBSIDIAN-PANELS-1 Phase 5 (consumer of CORE-DECISION-PROVENANCE-LOOKUP-1).
 *
 * Data path: `GET /memory/decisions?provenance_memory_id=<noteMemoryId>`
 * (via `client.decisions.list({ provenance_memory_id })`). The route performs
 * a BFS from the seed memory walking incoming `DERIVED_FROM` / `CAUSED_BY`
 * edges, returning active decisions whose provenance subgraph reaches the
 * note. Dual scope gate on the server side blocks any cross-workspace
 * leakage; unknown or out-of-scope memory ids return [] (never 404).
 *
 * Semantics note: "derived from" not "cites" — the underlying graph encodes
 * provenance (the LLM extraction / decision-creation chain), not authorial
 * citation. The empty-state copy reflects that. If transitive decision-chain
 * provenance lands later (CORE-DECISION-PROVENANCE-TRANSITIVE-1), this panel
 * will pick it up for free — no panel changes required.
 */
import { WorkspaceLeaf } from 'obsidian';
import type SmartMemoryPlugin from '../main';
import type { DecisionListResponse } from 'smartmemory-sdk-js/core';
import { SmartMemoryPanelBase } from './panel-base';

export const DECISIONS_PANEL_TYPE = 'smartmemory-decisions';

type DecisionRow = DecisionListResponse['decisions'][number];

export class DecisionsPanel extends SmartMemoryPanelBase {
	constructor(leaf: WorkspaceLeaf, plugin: SmartMemoryPlugin) {
		super(leaf, plugin);
	}

	getViewType(): string { return DECISIONS_PANEL_TYPE; }
	getDisplayText(): string { return 'SmartMemory decisions'; }
	getIcon(): string { return 'list-checks'; }
	protected rootClass(): string { return 'smartmemory-decisions-panel'; }

	// Decisions are a hosted-service subsystem (transitive provenance walk +
	// decision store). The local lite daemon reports capabilities.decisions =
	// false, so degrade explicitly instead of letting client.decisions.list()
	// 404. DIST-OBSIDIAN-LITE-PARITY-1.
	protected requiredCapability(): string { return 'decisions'; }
	protected unavailableText(): string {
		return 'Decisions aren’t available in local (lite) mode. Switch to Cloud in settings to use them.';
	}

	protected async render(root: HTMLElement, memoryId: string, seq: number): Promise<void> {
		root.createDiv({ cls: 'smartmemory-panel-loading', text: 'Loading…' });

		const client = this.plugin.client!;
		const result = await this.plugin.panelCache.get<DecisionListResponse>(
			memoryId,
			'/decisions?provenance_memory_id',
			() => client.decisions.list({ provenance_memory_id: memoryId, limit: 50 }),
		);
		if (seq !== this.refreshSeq) return;

		root.empty();
		root.createEl('h3', { text: this.getDisplayText() });

		const decisions = result?.decisions ?? [];
		if (decisions.length === 0) {
			this.renderInfo(root, 'No decisions derived from this note yet.');
			return;
		}

		const list = root.createEl('ul', { cls: 'smartmemory-decisions-list' });
		for (const d of decisions) {
			renderDecisionRow(this.plugin, list, d);
		}
	}
}

/**
 * Pure-ish renderer for a single decision row. Exported for testability —
 * the view itself is thin DOM glue; the per-row shape is what matters and
 * is what tests assert.
 */
export function renderDecisionRow(
	plugin: SmartMemoryPlugin,
	list: HTMLElement,
	d: DecisionRow,
): void {
	const li = list.createEl('li', { cls: 'smartmemory-decision-row' });

	// Status pill — active / superseded / retracted styled differently.
	const status = (d.status || 'active').toLowerCase();
	li.createSpan({
		cls: `smartmemory-decision-status smartmemory-decision-status-${status}`,
		text: status,
	});

	const content = typeof d.content === 'string' ? d.content : '';
	const snippet = content.length > 120 ? content.slice(0, 120) + '…' : content;
	li.createDiv({ cls: 'smartmemory-decision-content', text: snippet || '(no content)' });

	const meta = li.createDiv({ cls: 'smartmemory-decision-meta' });
	if (d.created_at) {
		const formatted = formatCreatedAt(d.created_at);
		meta.createSpan({ cls: 'smartmemory-decision-date', text: formatted });
	}
	if (d.domain) {
		meta.createSpan({ cls: 'smartmemory-decision-domain', text: d.domain });
	}
	if (typeof d.confidence === 'number') {
		meta.createSpan({
			cls: 'smartmemory-decision-confidence',
			text: `conf ${d.confidence.toFixed(2)}`,
		});
	}

	// Decision id is the stable handle; surface it so the user can copy or
	// reference it (a click-through web modal / Obsidian decision view is a
	// future enhancement — DIST-OBSIDIAN-PANELS-1 Phase 5 ships read-only).
	li.createSpan({
		cls: 'smartmemory-decision-id',
		text: d.decision_id,
	});
}

/**
 * Format an ISO-8601 timestamp as a short relative-or-absolute string.
 * Pure; testable.
 */
export function formatCreatedAt(iso: string): string {
	const t = Date.parse(iso);
	if (Number.isNaN(t)) return iso;
	const now = Date.now();
	const ageMs = now - t;
	const day = 24 * 60 * 60 * 1000;
	if (ageMs < day) return 'today';
	if (ageMs < 2 * day) return 'yesterday';
	if (ageMs < 7 * day) return `${Math.floor(ageMs / day)}d ago`;
	return new Date(t).toISOString().slice(0, 10);
}
