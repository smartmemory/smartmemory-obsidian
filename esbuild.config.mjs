import esbuild from 'esbuild';
import process from 'process';
import { readFileSync } from 'fs';

const prod = process.argv[2] === 'production';

// Inject the manifest version at build time so main.ts can reference
// __SMARTMEMORY_VERSION__ in code that runs during onload(). Without this
// define, surfaceLoadState() throws a ReferenceError and the plugin fails
// to load.
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));

const context = await esbuild.context({
	entryPoints: ['src/main.ts'],
	bundle: true,
	external: ['obsidian', 'electron', '@codemirror/autocomplete', '@codemirror/collab', '@codemirror/commands', '@codemirror/language', '@codemirror/lint', '@codemirror/search', '@codemirror/state', '@codemirror/view', '@lezer/common', '@lezer/highlight', '@lezer/lr'],
	format: 'cjs',
	target: 'es2018',
	logLevel: 'info',
	sourcemap: prod ? false : 'inline',
	treeShaking: true,
	outfile: 'main.js',
	minify: prod,
	define: {
		__SMARTMEMORY_VERSION__: JSON.stringify(manifest.version),
	},
});

if (prod) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
