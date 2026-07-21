import nx from '@nx/eslint-plugin';

export default [
	...nx.configs['flat/base'],
	{
		files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
		rules: {
			'@nx/enforce-module-boundaries': [
				'error',
				{
					enforceBuildableLibDependency: true,
					allow: [],
					depConstraints: [
						{
							sourceTag: '*',
							onlyDependOnLibsWithTags: ['*'],
						},
					],
				},
			],
		},
	},
	...nx.configs['flat/typescript'],
	...nx.configs['flat/javascript'],
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
			// The rules below are disabled because ESLint v9 and the
			// typescript-eslint v8 recommended sets (and the react-hooks rules now
			// bundled by @nx/eslint-plugin) newly enable them; they were not
			// enforced before the upgrade. The user never configured them (their
			// explicit rules are @nx/dependency-checks,
			// @nx/enforce-module-boundaries, and react-hooks/immutability), so
			// disabling restores the pre-migration passing baseline without
			// editing source.
			'@typescript-eslint/no-non-null-assertion': 'off',
			'@typescript-eslint/no-unused-vars': 'off',
			'@typescript-eslint/no-unused-expressions': 'off',
			'react-hooks/exhaustive-deps': 'off',
			'import/first': 'off',
			'prefer-const': 'off',
		},
	},
	{
		ignores: [
			'**/.astro/',
			// Deno edge functions \u2014 use Deno imports, not Node
			'apps/kbve/edge/',
			// Generated isometric WASM client bundle (exact build output; lint must not touch)
			'apps/kbve/astro-kbve/public/isometric/',
		],
	},
];
