/**
 * Tailwind config for the Obsidian plugin.
 *
 * The shared @smartmemory/graph component library uses Tailwind utility classes
 * (~150 unique). We scan its JSX sources at build time and emit only the used
 * classes into styles.css. The plugin's own TS files don't use Tailwind today
 * but are scanned anyway in case they grow into it.
 *
 * The whole stylesheet is wrapped under .smartmemory-graph-view so utilities
 * don't leak into the rest of Obsidian — see esbuild.config.mjs PostCSS step.
 */
module.exports = {
	content: [
		'./src/**/*.{ts,tsx,js,jsx}',
		'../smart-memory-graph/src/**/*.{js,jsx}',
	],
	theme: { extend: {} },
	plugins: [],
	corePlugins: {
		preflight: false, // Don't reset Obsidian's base styles
	},
};
