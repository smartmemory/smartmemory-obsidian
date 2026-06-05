/**
 * smoke.electron.spec.ts — DIST-OBSIDIAN-E2E-2 (Tier 2)
 *
 * The launcher de-risk test: proves the real Obsidian binary boots into the
 * fixture vault with the plugin loaded and no plugin-level console errors.
 * Everything else in this tier builds on this passing.
 */
import { test, expect } from './obsidian-app';

test('real Obsidian boots into the fixture vault with the smartmemory plugin loaded', async ({ obsidian }) => {
	const loaded = await obsidian.page.evaluate(() => {
		const plugins = (window as any).app?.plugins;
		return {
			present: !!plugins?.plugins?.smartmemory,
			enabled: plugins?.enabledPlugins?.has?.('smartmemory') ?? false,
			vaultName: (window as any).app?.vault?.getName?.() ?? null,
		};
	});

	expect(loaded.present, 'smartmemory plugin instance should exist').toBe(true);
	expect(loaded.enabled, 'smartmemory should be in enabledPlugins').toBe(true);
	expect(loaded.vaultName).toBe('fixture-vault');
});

test('plugin loads without plugin-level console errors', async ({ obsidian }) => {
	// Give any deferred load work a beat to surface errors.
	await obsidian.page.waitForTimeout(1500);

	const pluginErrors = obsidian.consoleErrors.filter(
		(e) => /smartmemory|uncaught|unhandled/i.test(e),
	);
	expect(pluginErrors, `plugin-level console errors:\n${pluginErrors.join('\n')}`).toHaveLength(0);
});
