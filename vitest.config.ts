import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
	test: {
		// jsdom gives the Obsidian polyfill in tests/__mocks__/obsidian.ts a
		// real DOM to attach createDiv/createEl/etc to. Pre-Phase-5 tests were
		// pure helpers under environment: 'node'; the jsdom switch is
		// backwards-compatible because helpers don't touch the DOM and pure-fn
		// tests are jsdom-agnostic. DIST-OBSIDIAN-E2E-1 Tier 1.
		environment: 'jsdom',
		alias: {
			obsidian: path.resolve(__dirname, 'tests/__mocks__/obsidian.ts'),
		},
	},
});
