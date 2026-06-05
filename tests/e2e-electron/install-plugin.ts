/**
 * install-plugin.ts — DIST-OBSIDIAN-E2E-2 (Tier 2)
 *
 * Builds the plugin and copies the artifacts into the fixture vault's plugin
 * directory so a real-Obsidian launch sees a pre-installed, enabled plugin.
 *
 * Runtime settings (data.json) are NOT written here — the launcher
 * (obsidian-app.ts) writes them at test time so it can inject the live mock
 * backend port. This file only owns the binaries.
 *
 * Compiled to CJS by Playwright's loader; uses CJS __dirname (not import.meta).
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const PLUGIN_ROOT = resolve(__dirname, '..', '..');
const FIXTURE_PLUGIN_DIR = resolve(__dirname, 'fixture-vault', '.obsidian', 'plugins', 'smartmemory');
const ARTIFACTS = ['main.js', 'manifest.json', 'styles.css'];

export function installPlugin({ build = true }: { build?: boolean } = {}): string {
	if (build) {
		console.log('[install-plugin] building plugin (npm run build)...');
		execSync('npm run build', { cwd: PLUGIN_ROOT, stdio: 'inherit' });
	}

	for (const artifact of ARTIFACTS) {
		const src = resolve(PLUGIN_ROOT, artifact);
		if (!existsSync(src)) {
			throw new Error(`[install-plugin] missing build artifact: ${src} (did the build run?)`);
		}
	}

	// Fresh plugin dir each install so stale binaries never leak between runs.
	rmSync(FIXTURE_PLUGIN_DIR, { recursive: true, force: true });
	mkdirSync(FIXTURE_PLUGIN_DIR, { recursive: true });

	for (const artifact of ARTIFACTS) {
		copyFileSync(resolve(PLUGIN_ROOT, artifact), resolve(FIXTURE_PLUGIN_DIR, artifact));
	}
	console.log(`[install-plugin] installed ${ARTIFACTS.join(', ')} -> ${FIXTURE_PLUGIN_DIR}`);
	return FIXTURE_PLUGIN_DIR;
}
