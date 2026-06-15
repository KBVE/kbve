import type { AstroIntegration } from 'astro';

const WEB_EXTENSIONS = [
	'.web.tsx',
	'.web.ts',
	'.web.jsx',
	'.web.js',
	'.tsx',
	'.ts',
	'.jsx',
	'.js',
	'.json',
];

export function kbveRnAstro(): AstroIntegration {
	return {
		name: '@kbve/rn-astro',
		hooks: {
			'astro:config:setup': ({ updateConfig }) => {
				updateConfig({
					vite: {
						resolve: {
							alias: [
								{
									find: /^react-native$/,
									replacement: 'react-native-web',
								},
							],
							extensions: WEB_EXTENSIONS,
						},
						optimizeDeps: {
							include: ['react-native-web'],
						},
					},
				});
			},
		},
	};
}
