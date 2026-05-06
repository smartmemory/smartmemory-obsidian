# Contributing

## One-time setup

Activate the auto-bump pre-commit hook so commits to `src/` automatically bump the patch version (keeps `package.json`, `manifest.json`, and `versions.json` in lockstep with shipped bundles):

```bash
git config core.hooksPath .githooks
```

## Hook behavior

- Triggers when staged files match `src/`, `manifest.json`, `esbuild.config.mjs`, `main.js`, or `styles.css`
- If you already bumped the version in your commit, the hook validates `package.json` and `manifest.json` agree and exits clean
- Otherwise it bumps patch (e.g. `0.1.2 → 0.1.3`) across all three files and stages them
- Bypass with `SKIP_VERSION_BUMP=1 git commit ...` (use sparingly — docs-only commits are the legitimate case)

## Tests

```bash
npm test          # vitest run, all suites
npm run test:watch
npm run build     # esbuild → main.js
```

## Bundle tag

`src/main.ts` carries a `BUNDLE_TAG` constant surfaced as a load-time Notice. Update it whenever shipping a behavior change so the running bundle is identifiable from the Obsidian console.
