/**
 * Tests for lite/cloud client-connection gating (DIST-OBSIDIAN-LITE-PARITY-1).
 *
 * The bug this guards: lite mode was unreachable without an API key because
 * initClient() always required one. The daemon reports auth:false, so lite
 * must connect keyless. Cloud still requires a key.
 */
import { describe, it, expect } from 'vitest';
import { resolveClientConfig } from '../src/services/client-config';
import { LITE_DAEMON_URL } from '../src/types';

describe('resolveClientConfig', () => {
	it('cloud + key → connects in apiKey mode', () => {
		const r = resolveClientConfig({ mode: 'cloud', apiUrl: 'https://api.smartmemory.ai', apiKey: 'sk_abc' });
		expect(r.connect).toBe(true);
		if (r.connect) {
			expect(r.auth).toBe('apiKey');
			expect(r.apiKey).toBe('sk_abc');
		}
	});

	it('cloud + NO key → refuses to connect (key required)', () => {
		const r = resolveClientConfig({ mode: 'cloud', apiUrl: 'https://api.smartmemory.ai', apiKey: '' });
		expect(r.connect).toBe(false);
	});

	it('lite + NO key → connects keyless (daemon has no auth)', () => {
		const r = resolveClientConfig({ mode: 'lite', apiUrl: LITE_DAEMON_URL, apiKey: '' });
		expect(r.connect).toBe(true);
		if (r.connect) {
			expect(r.auth).toBe('none');
		}
	});

	it('lite + leftover key → still keyless (lite never authenticates)', () => {
		const r = resolveClientConfig({ mode: 'lite', apiUrl: LITE_DAEMON_URL, apiKey: 'sk_leftover' });
		expect(r.connect).toBe(true);
		if (r.connect) {
			expect(r.auth).toBe('none');
		}
	});

	it('no apiUrl → refuses to connect regardless of mode', () => {
		expect(resolveClientConfig({ mode: 'lite', apiUrl: '', apiKey: '' }).connect).toBe(false);
		expect(resolveClientConfig({ mode: 'cloud', apiUrl: '', apiKey: 'sk_abc' }).connect).toBe(false);
	});

	it('lite mode never needs workspace auto-discovery (daemon is single-tenant)', () => {
		const r = resolveClientConfig({ mode: 'lite', apiUrl: LITE_DAEMON_URL, apiKey: '' });
		expect(r.connect).toBe(true);
		if (r.connect) {
			expect(r.discoverWorkspace).toBe(false);
		}
	});

	it('cloud mode allows workspace auto-discovery', () => {
		const r = resolveClientConfig({ mode: 'cloud', apiUrl: 'https://api.smartmemory.ai', apiKey: 'sk_abc' });
		expect(r.connect).toBe(true);
		if (r.connect) {
			expect(r.discoverWorkspace).toBe(true);
		}
	});
});
