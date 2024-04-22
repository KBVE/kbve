const {
	createGlobPatternsForDependencies,
} = require('@nxtensions/astro/tailwind');
const { join } = require('path');



/** @type {import('tailwindcss').Config} */
import colors from 'tailwindcss/colors';

module.exports = {
	content: [
		join(
			__dirname,
			'src/**/!(*.stories|*.spec).{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'
		),
		...createGlobPatternsForDependencies(__dirname),
	],
	darkMode: "class",
	theme: {
		colors: {
			transparent: "transparent",
			current: "currentColor",
			black: "#000000",
			white: "#ffffff",
			cyan: colors.cyan,
			gray: colors.gray,
			indigo: colors.indigo,
			neutral: colors.neutral,  // Used mainly for text color
			yellow: {
			  50: "#fefce8",
			  100: "#fef9c3",
			  400: "#facc15",
			  500: "#eab308",
			}, // Accent colors, used mainly for star color, heading and buttons
			orange: {
			  100: "#ffedd5",
			  200: "#fed7aa",
			  300: "#fb713b",
			  400: "#fa5a15",
			  500: "#e14d0b",
			  600: "#ea580c",
			}, // Primary colors, used mainly for links, buttons and svg icons
			red: colors.red, // Used for bookmark icon
			zinc: colors.zinc, // Used mainly for box-shadow
		  },
		extend: {
			colors: {
				// Color extension is prefixed as KBVE to avoid class conflicts
				kbve: '#8C52FF',

				'kbve-primary': '#48BB78',
				'kbve-primary-light': '#48BB78',

				'kbve-secondary': '#1c033c',

				'kbve-menu-primary': '#27272A',
				'kbve-svg-primary': '#91ffff',
				'kbve-svg-primary-dyn': 'var(--color-kbve-svg-primary-dyn)',
				'kbve-text-primary': '#91ffff',
				'kbve-text-primary-dyn': 'var(--color-kbve-text-primary-dyn)',
				'kbve-text-secondary': '#ffffff',
				'kbve-text-secondary-dyn':
					'var(--color-kbve-text-secondary-dyn)',
			},
			backgroundColor: {
				default: 'var(--color-background)',
				//offset: "var(--color-background-offset)",
				'kbve-menu-bg': '#09090b', // zinc 950 as hex
				'kbve-menu-bg-dyn': 'var(--color-kbve-menu-bg-dyn)', // Dynamic Variable

				offset: '#23262d',
			},

			backgroundImage: (theme) => ({
				'custom-gradient': `linear-gradient(to right, ${theme(
					'colors.kbve'
				)}, ${theme('colors.kbve-primary')}, ${theme(
					'colors.kbve-secondary'
				)})`,
			}),

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
	plugins: [
		require('@tailwindcss/typography'),
		require("tailwindcss/nesting"),
		require("preline/plugin"),
		require("@tailwindcss/forms"),	
		function ({ addUtilities }) {
			const newUtilities = {
			  '.comic': {
				display: 'grid',
				gridTemplateColumns: '1fr 6fr 4fr 9fr 6fr repeat(2, 1fr)',
				gridTemplateRows: '16px 2.35fr 1fr 0.5fr 0.3fr 1fr 1fr 0.35fr 0.45fr 1.25fr',
				margin: '0 auto',
			  },
			  '.grid-row-end-auto': {
				gridRow: '8 / -1',
			  },
			  '.grid-col-span-4-6': {
				gridColumn: '4 / 6',
			  },
			  '.height-180': {
				height: '180%',
			  },
			  '.panel-1': {
				gridRow: '2 / span 1',
				gridColumn: '2 / span 1',
				zIndex: '1',
			  },
			  '.panel-2': {
				gridRow: '1 / span 5',
				gridColumn: '1 / -1',
			  },
			  '.panel-3': {
				gridRow: '4 / 7',
				gridColumn: '5 / span 1',
				zIndex: '1',
			  },
			  '.panel-4': {
				gridRow: '5 / 9',
				gridColumn: '2 / -2',
			  },
			  '.panel-5': {
				gridRow: '10 / -1',
				gridColumn: '1 / -1',
			  },
			};
			addUtilities(newUtilities, ['responsive', 'hover']);
		  },
	],
};
