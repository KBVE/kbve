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

		'bg-gradient-to-br',
		'from-purple-600', 'to-indigo-800',
		'from-teal-500', 'to-cyan-600',
		'from-rose-500', 'to-pink-600',
		'from-amber-400', 'to-yellow-500',
		'from-red-600', 'to-orange-500',
		'drop-shadow-purple-600/40',
		'drop-shadow-teal-500/40',
		'drop-shadow-rose-500/40',
		'drop-shadow-amber-400/40',
		'drop-shadow-red-600/40',
		'hover:drop-shadow-indigo-800/60',
		'hover:drop-shadow-cyan-600/60',
		'hover:drop-shadow-pink-600/60',
		'hover:drop-shadow-yellow-500/60',
		'hover:drop-shadow-orange-500/60',
		'hover:rotate-x-10', 'hover:rotate-z-45'

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
