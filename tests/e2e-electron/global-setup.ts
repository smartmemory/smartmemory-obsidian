/**
 * global-setup.ts — DIST-OBSIDIAN-E2E-2 (Tier 2)
 *
 * Runs once before the Electron specs: builds the plugin and installs the
 * binaries into the fixture vault. Per-test runtime config (data.json + mock
 * port) is written by the launcher fixture, not here.
 */
import { installPlugin } from './install-plugin';

export default async function globalSetup() {
	const build = process.env.E2E_SKIP_BUILD !== '1';
	installPlugin({ build });
}
