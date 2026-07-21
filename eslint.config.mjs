import baseConfig from './eslint.base.config.mjs';

export default [
	...baseConfig,
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
	{
		files: ['**/*.ts', '**/*.tsx'],
		// Override or add rules here
		rules: {},
	},
	{
		files: ['**/*.js', '**/*.jsx'],
		// Override or add rules here
		rules: {},
	},
	{
		// Restores the pre-migration root ignorePatterns: ["**/*"]. The eslintrc
		// root ignored every file and each project opted its own sources back in
		// via "!**/*"; projects without their own config were never linted. The
		// flat-config pre-pass dropped this, newly exposing every inferred-plugin
		// project (no local eslint.config.*) to linting for the first time. This
		// root config governs only those inferred projects, so ignoring "**/*"
		// here reproduces their prior no-op lint. Projects with a converted
		// eslint.config.mjs import eslint.base.config.mjs directly and are
		// unaffected.
		ignores: [
			'**/*',
			'**/.astro/',
			// Deno edge functions \u2014 use Deno imports, not Node
			'apps/kbve/edge/',
			// Generated isometric WASM client bundle (exact build output; lint must not touch)
			'apps/kbve/astro-kbve/public/isometric/',
		],
	},
];
