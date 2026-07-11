import { beforeEach, describe, expect, it, vi } from 'vitest';
import SmartMemoryPlugin from '../src/main';
import { EMPTY_MAPPINGS } from '../src/types';

describe('legacy settings to OKF settings migration', () => {
	let plugin: SmartMemoryPlugin;
	let saveData: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		plugin = Object.create(SmartMemoryPlugin.prototype);
		(plugin as any).writeTail = Promise.resolve();
		saveData = vi.fn().mockResolvedValue(undefined);
		(plugin as any).saveData = saveData;
	});

	async function load(settings: Record<string, unknown>): Promise<void> {
		(plugin as any).loadData = vi.fn().mockResolvedValue({ settings, mappings: EMPTY_MAPPINGS });
		await plugin.loadSettings();
	}

	it('synchronously preserves an explicit legacy identity opt-out', async () => {
		await load({ writeFrontmatterId: false, hasCompletedOnboarding: true });

		expect(plugin.settings.okfConformance).toBe(false);
		expect(plugin.settings.migratedOkfSettings).toBe(true);
		expect(saveData).toHaveBeenCalledTimes(1);
	});

	it('maps the previous enrichment master to the optional extension', async () => {
		await load({ writeFrontmatterEnrichment: true, hasCompletedOnboarding: true });
		expect(plugin.settings.writeSmartMemoryExtension).toBe(true);
	});

	it('maps pre-master enrich flags to the optional extension', async () => {
		await load({ enrichRelations: true, hasCompletedOnboarding: true });
		expect(plugin.settings.writeSmartMemoryExtension).toBe(true);
	});

	it('does not clobber explicitly persisted new OKF keys', async () => {
		await load({
			writeFrontmatterId: false,
			writeFrontmatterEnrichment: true,
			okfConformance: true,
			writeSmartMemoryExtension: false,
			hasCompletedOnboarding: true,
		});

		expect(plugin.settings.okfConformance).toBe(true);
		expect(plugin.settings.writeSmartMemoryExtension).toBe(false);
	});

	it('does not rerun or persist an already-completed migration', async () => {
		await load({
			migratedOkfSettings: true,
			okfConformance: false,
			writeSmartMemoryExtension: false,
			hasCompletedOnboarding: true,
		});

		expect(plugin.settings.okfConformance).toBe(false);
		expect(saveData).not.toHaveBeenCalled();
	});
});
