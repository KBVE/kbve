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

		// [Static SafeList] @h0lybyte

		'card-tile',
		'bento-grid-3',

		
		// Gradient colors @GPT
		{ pattern: /from-(purple|teal|rose|amber|red|stone|zinc)-[0-9]+/ },
		{ pattern: /to-(indigo|cyan|pink|yellow|orange|stone|zinc)-[0-9]+/ },

		// Drop shadows @GPT
		{ pattern: /drop-shadow-(purple|teal|rose|amber|red)-[0-9]+\/[0-9]+/ },
		{ pattern: /hover:drop-shadow-(indigo|cyan|pink|yellow|orange)-[0-9]+\/[0-9]+/ },

		// View transition utility classes @GPT
		'animate-fade-in',
		'transition',
		'transition-all',
		'duration-300',
		'duration-1000',
		'ease-out',
		'hover:scale-[1.01]',
		'group-hover:bg-black/20',
		'opacity-0',
		'opacity-5',
		'opacity-10',
		'opacity-15',
		'opacity-20',
		'opacity-80',
		'translate-x-20',
		'-translate-x-64',
		'backdrop-blur-sm',

		// [Additioanl Bento Statics] @GPT

		'col-span-1', 'col-span-2', 'col-span-3', 'col-span-4',
		'row-span-1', 'row-span-2', 'row-span-3', 'row-span-4',

		// [Additional Static Safes] @h0lybyte
		'bg-cyan-300/20',
		'bg-gradient-to-br',
		'from-zinc-500', 'to-stone-900',
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
		'hover:rotate-x-10', 'hover:rotate-z-45',

		// For the new Bento tile (Community CTA)
		'from-emerald-500',
		'to-cyan-600',
		'drop-shadow-emerald-500/40',
		'hover:drop-shadow-cyan-600/60',

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
