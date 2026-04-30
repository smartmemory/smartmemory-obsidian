/**
 * Entity mention detection and wikilink insertion.
 *
 * Hard rules (preserve user content):
 * - Never modify text inside fenced code blocks (```...```)
 * - Never modify text inside inline code (`...`)
 * - Never modify text inside YAML frontmatter (--- ... ---)
 * - Never modify text already inside [[wikilinks]]
 * - Never modify text inside markdown links [text](url)
 * - Never modify text inside bare URLs (http://, https://)
 * - Whole-word matches only (entity in middle of larger word doesn't match)
 */

export interface EntityCandidate {
	name: string;
	target: string; // path or alias to link to
}

export interface LinkProposal {
	entityName: string;
	matchedText: string;  // exact text in source (preserves casing)
	target: string;
	start: number;
	end: number;
}

/**
 * Compute regions of `text` that must NOT receive link insertions.
 * Returns sorted, non-overlapping [start, end) ranges.
 */
function findExcludedRegions(text: string): Array<[number, number]> {
	const regions: Array<[number, number]> = [];

	// YAML frontmatter at start of document: --- ... ---
	if (text.startsWith('---\n')) {
		const closingIndex = text.indexOf('\n---', 4);
		if (closingIndex !== -1) {
			regions.push([0, closingIndex + 4]);
		}
	}

	// Fenced code blocks (```...``` or ~~~...~~~)
	const fenceRe = /(^|\n)(```|~~~)[\s\S]*?\n\2/g;
	let match: RegExpExecArray | null;
	while ((match = fenceRe.exec(text)) !== null) {
		regions.push([match.index, match.index + match[0].length]);
	}

	// Inline code: `...` (single backtick spans, not crossing newlines)
	const inlineRe = /`[^`\n]+`/g;
	while ((match = inlineRe.exec(text)) !== null) {
		regions.push([match.index, match.index + match[0].length]);
	}

	// Existing [[wikilinks]]
	const wikilinkRe = /\[\[[^\]]+\]\]/g;
	while ((match = wikilinkRe.exec(text)) !== null) {
		regions.push([match.index, match.index + match[0].length]);
	}

	// Markdown links [text](url)
	const mdLinkRe = /\[[^\]]+\]\([^)]+\)/g;
	while ((match = mdLinkRe.exec(text)) !== null) {
		regions.push([match.index, match.index + match[0].length]);
	}

	// Bare URLs (http://..., https://...)
	const urlRe = /https?:\/\/\S+/g;
	while ((match = urlRe.exec(text)) !== null) {
		regions.push([match.index, match.index + match[0].length]);
	}

	regions.sort((a, b) => a[0] - b[0]);
	return mergeRegions(regions);
}

function mergeRegions(regions: Array<[number, number]>): Array<[number, number]> {
	if (regions.length === 0) return regions;
	const merged: Array<[number, number]> = [regions[0]];
	for (let i = 1; i < regions.length; i++) {
		const last = merged[merged.length - 1];
		const cur = regions[i];
		if (cur[0] <= last[1]) {
			last[1] = Math.max(last[1], cur[1]);
		} else {
			merged.push(cur);
		}
	}
	return merged;
}

function isInExcludedRegion(pos: number, regions: Array<[number, number]>): boolean {
	for (const [start, end] of regions) {
		if (pos >= start && pos < end) return true;
		if (start > pos) return false; // sorted — early exit
	}
	return false;
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function findEntityMentions(
	text: string,
	candidates: EntityCandidate[],
): LinkProposal[] {
	if (!text || candidates.length === 0) return [];

	const excluded = findExcludedRegions(text);
	const proposals: LinkProposal[] = [];

	for (const candidate of candidates) {
		if (!candidate.name) continue;
		// \b doesn't work well with non-ASCII; use look-around for word boundaries
		const re = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegex(candidate.name)}(?![\\p{L}\\p{N}_])`, 'giu');
		let match: RegExpExecArray | null;
		while ((match = re.exec(text)) !== null) {
			if (isInExcludedRegion(match.index, excluded)) continue;
			proposals.push({
				entityName: candidate.name,
				matchedText: match[0],
				target: candidate.target,
				start: match.index,
				end: match.index + match[0].length,
			});
		}
	}

	proposals.sort((a, b) => a.start - b.start);
	return proposals;
}

/**
 * Apply accepted proposals back-to-front so earlier offsets remain valid.
 */
export function applyLinkInsertions(text: string, proposals: LinkProposal[]): string {
	if (proposals.length === 0) return text;

	const sorted = [...proposals].sort((a, b) => b.start - a.start);
	let result = text;
	for (const p of sorted) {
		const linkText = `[[${p.target}|${p.matchedText}]]`;
		result = result.slice(0, p.start) + linkText + result.slice(p.end);
	}
	return result;
}
