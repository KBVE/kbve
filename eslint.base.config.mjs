// The shared ESLint layer, one import for every project that lints.
//
// This was @nx/eslint-plugin's flat/base + flat/typescript + flat/javascript.
// Those presets were eslint:recommended plus typescript-eslint's recommended
// sets applied to both .ts and .js, so that is what they are spelled as here,
// and the `off` overrides below are carried across unchanged.
//
// The two rules that did not survive are @nx/enforce-module-boundaries and
// @nx/dependency-checks. Both read the Nx project graph to decide what a
// project may import, and there is no graph for them to read any more. moon
// models the same thing as `dependsOn`, which it enforces when it builds
// rather than when it lints.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Build output, vendored bundles and generated code. ESLint 9 ignores only
// node_modules by default, so anything else has to be named -- and linting a
// minified bundle produces thousands of findings about code nobody wrote.
export const ignores = [
	'**/node_modules/',
	'**/dist/',
	'**/build/',
	'**/target/',
	'**/.astro/',
	'**/.moon/',
	'**/wasm-pkg/',
	'**/.quick-staging/',
	'**/src-tauri/',
	'**/*.timestamp*',
	// Deno edge functions — Deno imports, not Node
	'apps/kbve/edge/',
	// Generated isometric WASM client bundle (exact build output)
	'apps/kbve/astro-kbve/public/isometric/',
];

export default [
	{ ignores },
	js.configs.recommended,
	...tseslint.configs.recommended.map((config) => ({
		...config,
		files: ['**/*.ts', '**/*.tsx', '**/*.cts', '**/*.mts'],
	})),
	{
		// Scoped to TypeScript, because typescript-eslint's recommended set is,
		// and a rule cannot be configured where its plugin is not registered.
		files: ['**/*.ts', '**/*.tsx', '**/*.cts', '**/*.mts'],
		rules: {
			// Disabled when ESLint 9 and typescript-eslint 8 newly enabled them.
			// They were never configured by hand, so switching them off keeps
			// the baseline that was passing before that upgrade.
			'@typescript-eslint/no-non-null-assertion': 'off',
			'@typescript-eslint/no-unused-vars': 'off',
			'@typescript-eslint/no-unused-expressions': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-empty-object-type': 'off',
		},
	},
	{
		files: [
			'**/*.ts',
			'**/*.tsx',
			'**/*.js',
			'**/*.jsx',
			'**/*.mjs',
			'**/*.cjs',
		],
		rules: {
			'prefer-const': 'off',
			'no-unused-vars': 'off',
			// TypeScript is the one checking that a name exists, and the JS here
			// runs in browsers, node and Deno alike -- no one globals list fits.
			'no-undef': 'off',
		},
	},
];
