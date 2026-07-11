import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
	OkfParseError,
	buildResource,
	isReserved,
	parseOkf,
	parseResource,
	renderOkf,
} from '../src/bridge/okf';

// SYNCED FROM smart-memory-core/tests/fixtures/okf/. Do not edit payloads here.
const FIXTURES = join(__dirname, 'fixtures', 'okf');
const NAMES = [
	'plain-semantic',
	'decision-supersedes',
	'bitemporal',
	'external-unknown',
	'index',
	'legacy',
];

describe.each(NAMES)('OKF golden fixture: %s', (name) => {
	it('parses to the Python OkfDocument.to_dict() shape', () => {
		const markdown = readFileSync(join(FIXTURES, `${name}.md`), 'utf8');
		const expected = JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8'));
		const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

		expect(parseOkf(markdown)).toEqual(expected);
		if (name === 'legacy') expect(warning).toHaveBeenCalledWith(expect.stringContaining('legacy OKF frontmatter'));
		warning.mockRestore();
	});

	it('is parse-stable after rendering', () => {
		const markdown = readFileSync(join(FIXTURES, `${name}.md`), 'utf8');
		const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const parsed = parseOkf(markdown);

		expect(parseOkf(renderOkf(parsed))).toEqual(parsed);
		warning.mockRestore();
	});
});

describe('OKF validation and helpers', () => {
	it.each([
		['---\ntype: semantic\n', 'closing fence'],
		['---\ntype: [\n---\nbody', 'Invalid OKF YAML'],
		['---\ntitle: Missing type\n---\nbody', "missing required 'type'"],
	])('rejects malformed input with a typed error', (text, message) => {
		expect(() => parseOkf(text)).toThrowError(OkfParseError);
		expect(() => parseOkf(text)).toThrow(message);
	});

	it('strips exactly one leading LF from the extracted body', () => {
		expect(parseOkf('---\ntype: semantic\n---\n\n\nbody').body).toBe('\nbody');
	});

	it('normalizes an unquoted YAML timestamp like Python safe_load', () => {
		const parsed = parseOkf('---\ntype: semantic\ntimestamp: 2026-07-11T10:00:00Z\n---\nbody');
		expect(parsed.timestamp).toBe('2026-07-11T10:00:00+00:00');
		expect(parseOkf('---\ntype: semantic\ntimestamp: 2026-07-11\n---\nbody').timestamp).toBe('2026-07-11');
	});

	it('builds and parses percent-encoded resource URIs', () => {
		const resource = buildResource('team a', 'note/1');
		expect(resource).toBe('smartmemory://team%20a/note%2F1');
		expect(parseResource(resource)).toEqual(['team a', 'note/1']);
	});

	it('validates resource shape and reserved basenames', () => {
		expect(() => parseResource('https://team-a/note-1')).toThrow('scheme');
		expect(() => parseResource('smartmemory://team-a/a/b')).toThrow('exactly one');
		expect(isReserved('bundle/index.md')).toBe(true);
		expect(isReserved('notes/log.md')).toBe(true);
		expect(isReserved('notes/index.md.bak')).toBe(false);
	});
});
