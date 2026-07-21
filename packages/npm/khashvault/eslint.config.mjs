import baseConfig from '../../../eslint.base.config.mjs';
import jsoncEslintParser from 'jsonc-eslint-parser';

export default [
	...baseConfig,
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
		files: ['**/*.json'],
		rules: {
			'@nx/dependency-checks': [
				'error',
				{
					ignoredFiles: [
						'{projectRoot}/eslint.config.{js,cjs,mjs}',
						'{projectRoot}/vite.config.{js,ts,mjs,mts}',
					],
					ignoredDependencies: ['@kbve/droid'],
				},
			],
		},
		languageOptions: {
			parser: jsoncEslintParser,
		},
	},
	{
		ignores: [
			'**/vite.config.*.timestamp*',
			'**/vitest.config.*.timestamp*',
		],
	},
];
