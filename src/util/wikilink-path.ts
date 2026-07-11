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

/**
 * Convert a vault path to the relative destination Markdown uses from a source
 * note. Keep the extension and all legal filename characters; the Markdown
 * writer percent-encodes each path segment before insertion.
 */
export function toMarkdownLinkTarget(filePath: string, sourcePath: string): string {
	const target = filePath.split('/');
	const sourceDirectory = sourcePath.split('/').slice(0, -1);
	let shared = 0;
	while (shared < sourceDirectory.length && shared < target.length && sourceDirectory[shared] === target[shared]) {
		shared++;
	}
	return [...sourceDirectory.slice(shared).map(() => '..'), ...target.slice(shared)].join('/');
}
