const {
	createGlobPatternsForDependencies,
} = require('@nxtensions/astro/tailwind');
const { join } = require('path');
const { buildConfig } = require('../../packages/shadcnutils/src/tailwind.config');

/** @type {import('tailwindcss').Config} */
module.exports = buildConfig(__dirname, {
	content: [
		join(
			__dirname,
			'src/**/!(*.stories|*.spec).{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'
		),
		...createGlobPatternsForDependencies(__dirname),
	],
	theme: {
		extend: {
			keyframes: {
				float: {
					'0%, 100%': { transform: 'translate3d(0, 0, 0)' },
					'50%': { transform: 'translate3d(0, 30px, 0)' },
				},
				'ltr-linear-infinite': {
					'0%, 100%': { 'background-position': '0 0' },
					'50%': { 'background-position': '400% 0%' },
				},
			},
		},
	},
});
