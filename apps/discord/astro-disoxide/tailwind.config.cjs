const {
	createGlobPatternsForDependencies,
} = require('@nxtensions/astro/tailwind');
const { join } = require('path');
const { buildConfig } = require('../../../packages/shadcnutils/src/tailwind.config');

/** @type {import('tailwindcss').Config} */
module.exports = buildConfig(__dirname, {
	content: [
		join(
			__dirname,
			'src/**/!(*.stories|*.spec).{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'
		),
		...createGlobPatternsForDependencies(__dirname),
	],
	safelist: [
		'card-tile',
		'bento-grid-3',
	],
	theme: {
		extend: {
			animation: {
				'pattern-move': 'pattern-move 40s linear infinite',
			},
			keyframes: {
				'pattern-move': {
					'0%': { backgroundPosition: '0% 0%' },
					'100%': { backgroundPosition: '100% 100%' },
				},
			},

		},
	},
});
