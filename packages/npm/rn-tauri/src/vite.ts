import type { Plugin } from 'vite';

/**
 * Resolution order that lets `@kbve/rn` serve its browser-safe `.web.*`
 * implementations ahead of the native file of the same name.
 */
export const WEB_EXTENSIONS = [
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

/**
 * Vite plugin that makes `@kbve/rn` resolvable inside a Tauri webview.
 *
 * Mirrors `@kbve/rn-astro`'s integration: alias `react-native` to
 * `react-native-web` and prefer `.web.*` variants. `global`/`__DEV__` are
 * defined because parts of the React Native runtime expect them to exist.
 */
export interface KbveRnTauriOptions {
	/**
	 * Absolute path to `packages/npm` in the monorepo. `@kbve/rn` and
	 * `@kbve/core` are consumed through tsconfig path aliases rather than as
	 * installed packages, so Vite needs explicit aliases to find their source.
	 */
	packagesDir: string;
}

export function kbveRnTauri({ packagesDir }: KbveRnTauriOptions): Plugin {
	const rn = `${packagesDir}/rn/src`;
	const core = `${packagesDir}/core/src`;
	return {
		name: '@kbve/rn-tauri',
		config: () => ({
			resolve: {
				alias: [
					{
						find: /^@kbve\/rn\/ui$/,
						replacement: `${rn}/ui/index.ts`,
					},
					{
						find: /^@kbve\/rn\/ui\/(.*)$/,
						replacement: `${rn}/ui/$1`,
					},
					{
						find: /^@kbve\/rn\/(.*)$/,
						replacement: `${rn}/$1/index.ts`,
					},
					{ find: /^@kbve\/rn$/, replacement: `${rn}/index.ts` },
					{ find: /^@kbve\/core$/, replacement: `${core}/index.ts` },
				],
				extensions: WEB_EXTENSIONS,
			},
			define: {
				global: 'globalThis',
			},
		}),
	};
}
