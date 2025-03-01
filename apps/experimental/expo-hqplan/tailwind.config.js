/** @type {import('tailwindcss').Config} */
module.exports = {
	darkMode: 'class',
	content: [
		'./index.{js,jsx,ts,tsx}',
		'./src/app/**/*.{js,jsx,ts,tsx}',
		'./src/app/**/**/*.{js,jsx,ts,tsx}',
	],
	presets: [require('nativewind/preset')],
	plugins: [],
	corePlugins: {
		backgroundOpacity: true,
	  },
};
