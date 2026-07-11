/** Pure TypeScript codec for Google Open Knowledge Format v0.1 markdown. */

import { dump as dumpYaml, load as loadYaml } from 'js-yaml';

export type OkfValue = null | boolean | number | string | OkfValue[] | { [key: string]: OkfValue };
export type OkfMapping = Record<string, OkfValue>;

export interface OkfDocument {
	type: string;
	title: string | null;
	description: string | null;
	resource: string | null;
	tags: string[] | null;
	timestamp: string | null;
	smartmemory: OkfMapping;
	body: string;
	preserved_unknown: OkfMapping;
	okf_version: string | null;
}

export class OkfParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'OkfParseError';
	}
}

const NATIVE_KEYS = new Set(['type', 'title', 'description', 'resource', 'tags', 'timestamp']);
const LEGACY_KEYS = ['smartmemory_id', 'smartmemory_type', 'smartmemory_entities', 'smartmemory_relations'] as const;
const EXTENSION_DEFAULTS: OkfMapping = {
	schema_version: 1,
	origin: 'unknown',
	confidence: 1,
	stale: false,
	reference: false,
	edges: [],
	retrieved_context: [],
};

export function buildResource(workspace: string, itemId: string): string {
	if (!workspace) throw new Error('SmartMemory resource workspace must be non-empty');
	if (!itemId) throw new Error('SmartMemory resource item_id must be non-empty');
	return `smartmemory://${encodeURIComponent(workspace)}/${encodeURIComponent(itemId)}`;
}

export function parseResource(uri: string): [workspace: string, itemId: string] {
	if (typeof uri !== 'string') throw new Error('SmartMemory resource must be a string');
	const match = /^([^:]+):\/\/([^/]+)\/(.+)$/.exec(uri);
	const scheme = match?.[1] ?? '';
	if (scheme !== 'smartmemory') throw new Error(`Invalid SmartMemory resource scheme: ${JSON.stringify(scheme)}`);
	if (!match?.[2]) throw new Error('SmartMemory resource workspace must be non-empty');
	if (!match[3] || match[3].includes('/')) {
		throw new Error('SmartMemory resource must contain exactly one item_id component');
	}
	for (const component of [match[2], match[3]]) {
		if (/%(?![0-9A-Fa-f]{2})/.test(component)) {
			throw new Error('SmartMemory resource contains malformed percent-encoding');
		}
	}
	let workspace: string;
	let itemId: string;
	try {
		workspace = decodeURIComponent(match[2]);
		itemId = decodeURIComponent(match[3]);
	} catch (error) {
		throw new Error(`SmartMemory resource contains malformed percent-encoding: ${error instanceof Error ? error.message : String(error)}`);
	}
	if (!workspace || !itemId) {
		throw new Error('SmartMemory resource workspace and item_id must be non-empty');
	}
	return [workspace, itemId];
}

export function isReserved(filename: string): boolean {
	const basename = filename.split('/').pop();
	return basename === 'index.md' || basename === 'log.md';
}

export function parseOkf(text: string): OkfDocument {
	if (!text.startsWith('---')) {
		throw new OkfParseError('OKF document must start with a YAML frontmatter fence');
	}
	const lines = text.match(/.*(?:\r\n|\n|$)/g)?.filter(line => line.length > 0) ?? [];
	if (lines.length === 0 || lines[0].trim() !== '---') {
		throw new OkfParseError("OKF frontmatter opening fence must be exactly '---'");
	}
	const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
	if (closingIndex < 0) throw new OkfParseError('OKF frontmatter is missing its closing fence');

	const rawFrontmatter = lines.slice(1, closingIndex).join('');
	let frontmatter: OkfMapping;
	try {
		frontmatter = parseYamlMapping(rawFrontmatter);
	} catch (error) {
		throw new OkfParseError(`Invalid OKF YAML frontmatter: ${error instanceof Error ? error.message : String(error)}`);
	}

	migrateLegacy(frontmatter);
	const extension = take(frontmatter, 'smartmemory') ?? {};
	if (!isMapping(extension)) throw new OkfParseError('OKF smartmemory extension must be a mapping');
	const okfVersion = take(frontmatter, 'okf_version');
	const itemType = take(frontmatter, 'type') ?? '';
	if (!itemType && okfVersion !== '0.1') {
		throw new OkfParseError("OKF frontmatter is missing required 'type'");
	}
	if (typeof itemType !== 'string') throw new OkfParseError('OKF type must be a string');
	const tags = take(frontmatter, 'tags');
	if (tags !== null && tags !== undefined && (!Array.isArray(tags) || !tags.every(tag => typeof tag === 'string'))) {
		throw new OkfParseError('OKF tags must be a YAML list of strings');
	}

	let body = lines.slice(closingIndex + 1).join('');
	if (body.startsWith('\n')) body = body.slice(1);
	return {
		type: itemType,
		title: nullableString(take(frontmatter, 'title')),
		description: nullableString(take(frontmatter, 'description')),
		resource: nullableString(take(frontmatter, 'resource')),
		tags: tags == null ? null : tags as string[],
		timestamp: timestampString(take(frontmatter, 'timestamp'), rawFrontmatter),
		smartmemory: extension,
		body,
		preserved_unknown: frontmatter,
		okf_version: nullableString(okfVersion),
	};
}

export function renderOkf(doc: OkfDocument): string {
	if (!doc.type && doc.okf_version !== '0.1') throw new Error('OKF documents require a non-empty type');
	const frontmatter: OkfMapping = { ...doc.preserved_unknown };
	if (doc.okf_version !== null) {
		if (doc.type) throw new Error('okf_version is reserved for a bundle-root index.md');
		frontmatter.okf_version = doc.okf_version;
	} else if (doc.type) {
		frontmatter.type = doc.type;
	}
	for (const key of NATIVE_KEYS) {
		if (key === 'type') continue;
		const value = doc[key as keyof OkfDocument];
		if (value !== null && !(Array.isArray(value) && value.length === 0)) {
			frontmatter[key] = value as OkfValue;
		}
	}
	const extension = omitDefaults(doc.smartmemory);
	if (isMapping(extension) && Object.keys(extension).length > 0) frontmatter.smartmemory = extension;
	const yaml = renderYamlMapping(frontmatter).trimEnd();
	const body = doc.body.replace(/^\n+/, '');
	return `---\n${yaml}\n---\n${body ? `\n${body}` : ''}`;
}

function migrateLegacy(frontmatter: OkfMapping): void {
	const legacy = LEGACY_KEYS.filter(key => Object.prototype.hasOwnProperty.call(frontmatter, key));
	if (legacy.length === 0) return;
	console.warn(`[smartmemory] Read legacy OKF frontmatter keys during migration: ${legacy.sort().join(', ')}`);
	if ('smartmemory_id' in frontmatter && !('resource' in frontmatter)) frontmatter.resource = frontmatter.smartmemory_id;
	if ('smartmemory_type' in frontmatter && !('type' in frontmatter)) frontmatter.type = frontmatter.smartmemory_type;
	let extension = frontmatter.smartmemory;
	if (extension === null || extension === undefined) {
		extension = {};
		frontmatter.smartmemory = extension;
	}
	if (!isMapping(extension)) throw new OkfParseError('OKF smartmemory extension must be a mapping');
	if ('smartmemory_relations' in frontmatter && !('edges' in extension)) {
		extension.edges = frontmatter.smartmemory_relations;
	}
	if ('smartmemory_entities' in frontmatter) {
		let preserved = extension.preserved;
		if (preserved === null || preserved === undefined) {
			preserved = {};
			extension.preserved = preserved;
		}
		if (!isMapping(preserved)) throw new OkfParseError('OKF smartmemory.preserved must be a mapping');
		if (!('legacy_entities' in preserved)) preserved.legacy_entities = frontmatter.smartmemory_entities;
	}
	for (const key of legacy) delete frontmatter[key];
}

function timestampString(value: unknown, rawFrontmatter: string): string | null {
	if (value === null || value === undefined) return null;
	if (value instanceof Date) {
		const plain = rawFrontmatter.match(/^timestamp:\s*([^'"\s#][^#]*?)\s*(?:#.*)?$/m)?.[1]?.trim();
		if (plain) {
			if (/^\d{4}-\d{2}-\d{2}$/.test(plain)) return plain;
			return plain.replace(' ', 'T').replace(/Z$/, '+00:00');
		}
		return value.toISOString().replace('.000Z', '+00:00');
	}
	if (typeof value !== 'string') throw new OkfParseError('OKF timestamp must be an ISO-8601 string');
	return value;
}

function nullableString(value: OkfValue | undefined): string | null {
	return value === null || value === undefined ? null : value as string;
}

function take(mapping: OkfMapping, key: string): OkfValue | undefined {
	const value = mapping[key];
	delete mapping[key];
	return value;
}

function isMapping(value: unknown): value is OkfMapping {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function omitDefaults(value: OkfValue): OkfValue {
	if (Array.isArray(value)) return value.map(omitDefaults);
	if (!isMapping(value)) return value;
	const result: OkfMapping = {};
	for (const [key, item] of Object.entries(value)) {
		const cleaned = omitDefaults(item);
		if (cleaned === null) continue;
		if (Array.isArray(cleaned) && cleaned.length === 0) continue;
		if (isMapping(cleaned) && Object.keys(cleaned).length === 0) continue;
		if (Object.prototype.hasOwnProperty.call(EXTENSION_DEFAULTS, key) && deepEqual(EXTENSION_DEFAULTS[key], cleaned)) continue;
		result[key] = cleaned;
	}
	return result;
}

function deepEqual(left: OkfValue, right: OkfValue): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function parseYamlMapping(source: string): OkfMapping {
	const value = loadYaml(source) ?? {};
	if (!isMapping(value)) throw new Error('frontmatter must be a YAML mapping');
	return value as OkfMapping;
}

function renderYamlMapping(mapping: OkfMapping): string {
	return dumpYaml(mapping, { noRefs: true, sortKeys: false, lineWidth: -1, noCompatMode: true });
}
