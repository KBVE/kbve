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
		files: ['**/*.json'],
		rules: {
			'@nx/dependency-checks': [
				'error',
				{
					ignoredFiles: ['{projectRoot}/eslint.config.{js,cjs,mjs}'],
				},
			],
		},
		languageOptions: {
			parser: jsoncEslintParser,
		},
	},
];
