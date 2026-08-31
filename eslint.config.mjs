import baseConfig from './eslint.base.config.mjs';

export default [
	...baseConfig,
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
		ignores: ['**/*'],
	},
];
