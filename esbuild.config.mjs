import esbuild from 'esbuild';
import process from 'process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

// Force a single React/ReactDOM instance across the bundle.
// @smartmemory/graph is a file: dep with its own node_modules/react,
// which esbuild would otherwise treat as a separate React. Two React
// instances → duplicate dispatcher → "useState of null" at runtime.
const reactDir = resolve('./node_modules/react');
const reactDomDir = resolve('./node_modules/react-dom');

const prod = process.argv[2] === 'production';

// Inject the manifest version at build time so main.ts can reference
// __SMARTMEMORY_VERSION__ in code that runs during onload(). Without this
// define, surfaceLoadState() throws a ReferenceError and the plugin fails
// to load.
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));

// ─── CSS pipeline ────────────────────────────────────────────────────────────
// Process src/graph.css with PostCSS (Tailwind + autoprefixer). Tailwind
// scans @smartmemory/graph's JSX sources via tailwind.config.cjs `content`
// and emits only the utilities actually used. Output is appended to the
// plugin's existing styles.css under a .smartmemory-graph-view scope so
// utility names don't leak into Obsidian's main UI.
async function buildGraphCss() {
	const input = readFileSync('src/graph.css', 'utf8');
	const result = await postcss([
		tailwindcss({ config: './tailwind.config.cjs' }),
		autoprefixer(),
	]).process(input, { from: 'src/graph.css', to: 'graph-utilities.css' });

	const scoped = `.smartmemory-graph-view {\n${result.css}\n}\n`;

	const baseStyles = existsSync('src/styles.base.css')
		? readFileSync('src/styles.base.css', 'utf8')
		: '';
	writeFileSync('styles.css', `${baseStyles}\n${scoped}`);
	console.log(`[esbuild] Wrote styles.css (${(scoped.length / 1024).toFixed(1)} KB scoped utilities + ${(baseStyles.length / 1024).toFixed(1)} KB base)`);
}

// ─── JS bundle ───────────────────────────────────────────────────────────────
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
	loader: { '.jsx': 'jsx' },
	jsx: 'automatic',
	alias: {
		'react': reactDir,
		'react-dom': reactDomDir,
		'react-dom/client': reactDomDir + '/client.js',
		'react/jsx-runtime': reactDir + '/jsx-runtime.js',
	},
	define: {
		__SMARTMEMORY_VERSION__: JSON.stringify(manifest.version),
		'process.env.NODE_ENV': JSON.stringify(prod ? 'production' : 'development'),
	},
});

await buildGraphCss();

if (prod) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
