/**
 * Playwright config for Tier 2 real-Obsidian E2E (DIST-OBSIDIAN-E2E-2).
 * Promoted from playwright.config.example.ts once the launcher + fixture landed.
 *
 * Run:  npx playwright test -c tests/e2e-electron/playwright.config.ts
 * Env:  OBSIDIAN_BIN  override the auto-detected Obsidian binary path
 *       E2E_VERBOSE   log every mock-backend request
 */
import { defineConfig } from '@playwright/test';
import path from 'path';

export default defineConfig({
	testDir: '.',
	testMatch: /.*\.electron\.spec\.ts$/,
	globalSetup: path.resolve(__dirname, 'global-setup.ts'),
	timeout: 90_000,
	expect: { timeout: 15_000 },
	fullyParallel: false, // Obsidian Electron instances are heavy; serialize.
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
	use: {
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
	},
	outputDir: path.resolve(__dirname, '.obsidian-test-runs', 'artifacts'),
});
