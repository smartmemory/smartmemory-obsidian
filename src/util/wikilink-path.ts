/**
 * Convert a vault file path into a safe Obsidian wikilink target.
 *
 * Strips the .md extension and removes characters that have special meaning
 * inside [[...]]: `|` (alias separator), `]` (link terminator), `#` (heading
 * anchor), `^` (block anchor). Without this, a path containing any of these
 * would produce a malformed link.
 */
export function toWikilinkTarget(filePath: string): string {
	return filePath
		.replace(/\.md$/, '')
		.replace(/[|\]#^]/g, '');
}
