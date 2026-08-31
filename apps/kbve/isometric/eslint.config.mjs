import baseConfig from '../../../eslint.base.config.mjs';
import reactConfig from '../../../eslint.react.config.mjs';

export default [
	...baseConfig,
	...reactConfig,
	{
		files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
		// Override or add rules here
		rules: {},
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
		ignores: [
			'**/vite.config.*.timestamp*',
			'**/vitest.config.*.timestamp*',
			'src-tauri/**',
			'wasm-pkg/**',
		],
	},
];
