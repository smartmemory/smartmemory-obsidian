#!/usr/bin/env node
/**
 * Patch-bump hook for SmartMemory Obsidian plugin.
 *
 * Triggered from .husky/pre-commit. Behavior:
 *   1. Inspect the staged file list.
 *   2. If anything under src/, manifest.json, or package.json was staged,
 *      bump the patch in package.json + manifest.json, append the new
 *      version to versions.json (under the same minAppVersion already
 *      pinned for the prior version), and re-stage those three files.
 *   3. If nothing relevant is staged, exit 0 and do nothing.
 *
 * Skip cases:
 *   - SKIP_BUMP=1 in env (manual override for prep-only commits, e.g.
 *     editing CHANGELOG to describe an already-bumped patch).
 *   - The currently staged version in package.json already differs from
 *     the last committed version (someone bumped manually — respect it).
 *
 * Note: this hook does NOT update CHANGELOG.md. Changelog entries need
 * human prose; the hook only enforces monotonic versions.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = join(repoRoot, 'package.json');
const manifestPath = join(repoRoot, 'manifest.json');
const versionsPath = join(repoRoot, 'versions.json');

if (process.env.SKIP_BUMP === '1') {
	process.exit(0);
}

let staged;
try {
	staged = execSync('git diff --cached --name-only', { encoding: 'utf8' })
		.split('\n')
		.filter(Boolean);
} catch {
	process.exit(0); // not in a git context — nothing to do
}

const triggers = staged.filter(
	(p) => p.startsWith('src/') || p === 'manifest.json' || p === 'package.json',
);
if (triggers.length === 0) {
	process.exit(0);
}

// Respect a manual bump: if package.json's staged version differs from HEAD,
// the human already chose. Don't second-guess.
function readJSON(p) {
	return JSON.parse(readFileSync(p, 'utf8'));
}
function writeJSON(p, obj) {
	writeFileSync(p, JSON.stringify(obj, null, '\t') + '\n');
}

const stagedPkgVersion = readJSON(pkgPath).version;
let headPkgVersion;
try {
	headPkgVersion = JSON.parse(
		execSync('git show HEAD:package.json', { encoding: 'utf8' }),
	).version;
} catch {
	headPkgVersion = stagedPkgVersion; // first commit — proceed with normal bump
}

if (stagedPkgVersion !== headPkgVersion) {
	console.log(
		`[bump-patch] package.json version already changed (${headPkgVersion} → ${stagedPkgVersion}); leaving alone.`,
	);
	process.exit(0);
}

const [maj, min, patch] = stagedPkgVersion.split('.').map((n) => parseInt(n, 10));
if ([maj, min, patch].some((n) => Number.isNaN(n))) {
	console.error(
		`[bump-patch] cannot parse version "${stagedPkgVersion}" — aborting bump.`,
	);
	process.exit(1);
}
const next = `${maj}.${min}.${patch + 1}`;

const pkg = readJSON(pkgPath);
pkg.version = next;
writeJSON(pkgPath, pkg);

if (existsSync(manifestPath)) {
	const m = readJSON(manifestPath);
	const prevMin = m.minAppVersion || '1.5.0';
	m.version = next;
	writeJSON(manifestPath, m);

	if (existsSync(versionsPath)) {
		const v = readJSON(versionsPath);
		if (!v[next]) v[next] = prevMin;
		writeJSON(versionsPath, v);
	}
}

execSync(`git add ${pkgPath} ${manifestPath} ${versionsPath}`, { stdio: 'inherit' });
console.log(`[bump-patch] ${stagedPkgVersion} → ${next}`);
