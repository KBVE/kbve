import starlightPlugin from '@astrojs/starlight-tailwind';

/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
	theme: {
		extend: {
			colors: {
				ri: {
					bg: '#0F1419',
					panel: '#151C22',
					elevated: '#1B242C',
					border: '#24303A',
					oceanDeep: '#1F3A4A',
					oceanSteel: '#2C5364',
					oceanTeal: '#3E6E7A',
					text: '#E6EEF3',
					textSecondary: '#A8B3BA',
					textDisabled: '#6B7C86',
					accent: '#3AAED8',
					accentHover: '#2F8FA8',
					accentPressed: '#1F6F8B',
					danger: '#C44545',
					warning: '#D1A954',
					success: '#5FAF7A',
					rare: '#8C6BFF',
				},
			},
			backgroundImage: {
				'ri-hero':
					'linear-gradient(135deg, #0F1419 0%, #1F3A4A 55%, #3AAED8 140%)',
			},
			boxShadow: {
				'ri-focus': '0 0 0 4px rgba(58, 174, 216, 0.25)',
				'ri-glow': '0 0 24px rgba(58, 174, 216, 0.35)',
			},
		},
	},
	plugins: [starlightPlugin()],
};
