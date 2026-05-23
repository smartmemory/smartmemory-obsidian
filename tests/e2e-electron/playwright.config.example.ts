/**
 * Example Playwright config for Tier 2 real-Obsidian E2E.
 * NOT WIRED — DIST-OBSIDIAN-E2E-2 deferred. See ./README.md.
 *
 * To activate:
 *   1. Build fixture vault under fixture-vault/ with .obsidian/ pre-config
 *   2. Add an install script that copies built main.js/manifest.json/styles.css
 *      into fixture-vault/.obsidian/plugins/smartmemory/
 *   3. Add OS-specific OBSIDIAN_BIN env-var resolution
 *   4. Rename this file to playwright.config.ts
 *   5. Add `pnpm playwright install` or `npm i -D @playwright/test`
 */
import { defineConfig } from '@playwright/test';
import path from 'path';

export default defineConfig({
	testDir: '.',
	testMatch: /.*\.electron\.spec\.ts$/,
	timeout: 60_000,
	fullyParallel: false,  // Obsidian Electron instances are heavy; serialize.
	workers: 1,
	reporter: [['list'], ['html', { open: 'never' }]],

	use: {
		// Each test will resolve its own Obsidian binary path; this is just
		// a documentation knob to remind authors which env var to use.
		// process.env.OBSIDIAN_BIN ?? autoDetect()
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure',
	},

	projects: [
		{
			name: 'obsidian-electron',
			use: {
				// Custom launcher per OS. Replaces the default Chromium browser.
				// See https://playwright.dev/docs/api/class-electron — the
				// preferred entry is `_electron.launch({ executablePath, args })`
				// inside a fixture, not via the standard `browser` channel.
			},
		},
	],

	// Where the launcher will put fresh per-test Obsidian user-data dirs.
	// Cleared between runs to avoid first-run-wizard state leaking.
	outputDir: path.resolve(__dirname, '.obsidian-test-runs'),
});
