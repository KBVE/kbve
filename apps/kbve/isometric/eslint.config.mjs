import baseConfig from '../../../eslint.base.config.mjs';
import nx from '@nx/eslint-plugin';

export default [
	...baseConfig,
	...nx.configs['flat/react'],
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
