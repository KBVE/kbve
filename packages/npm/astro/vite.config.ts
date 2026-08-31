/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import * as path from 'path';
import tsconfigPaths from 'vite-tsconfig-paths';
import {
	copyFileSync,
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
} from 'node:fs';

// Every ./<path>.js in the export map has to be an entry, or rollup emits only
// the main bundle and the subpath resolves to a file that was never written --
// the package installs cleanly and the import fails. Deriving the entries from
// exports rather than listing them keeps the two from drifting: adding a
// subpath to package.json is enough to build it.
//
// '.astro' and '.mjs' targets are skipped; those ship as source, copied by
// copyAssets below.
const manifest = JSON.parse(
	readFileSync(path.join(__dirname, 'package.json'), 'utf8'),
);

const exportTargets: string[] = [];
const walk = (node: unknown) => {
	if (typeof node === 'string') exportTargets.push(node);
	else if (node && typeof node === 'object')
		Object.values(node).forEach(walk);
};
walk(manifest.exports ?? {});

const entry: Record<string, string> = {
	// exports['.'] points here, and the name is kept so the published main file
	// does not move.
	'astro.es': path.resolve(__dirname, 'src/index.ts'),
};

for (const target of exportTargets) {
	if (!target.endsWith('.js') || target === './astro.es.js') continue;
	const stem = target.replace(/^\.\//, '').replace(/\.js$/, '');
	const source = ['.ts', '.tsx']
		.map((ext) => path.resolve(__dirname, 'src', stem + ext))
		.find(existsSync);
	if (!source) {
		throw new Error(
			`package.json exports "${target}" but there is no src/${stem}.ts or .tsx. ` +
				`Remove the export or add the file.`,
		);
	}
	entry[stem] = source;
}

// What @nx/vite's nxCopyAssetsPlugin did here, written out.
//
// Three things ship beside the bundles: the README, the sitemap helpers, and
// the ~50 .astro components, which are published as source because `exports`
// names each one at ./components/<name>.astro. Nothing copied the components
// before the plugin was told to, and every published consumer of one got a
// missing file -- local consumers resolve through tsconfig paths, which is why
// it held for so long. tools/npm/pack.mjs checks the result.
function copyAssets(): Plugin {
	return {
		name: 'kbve-copy-assets',
		apply: 'build',
		closeBundle() {
			const out = path.resolve(
				__dirname,
				'../../../dist/packages/npm/astro',
			);
			for (const file of readdirSync(__dirname)) {
				if (file.endsWith('.md')) {
					copyFileSync(
						path.join(__dirname, file),
						path.join(out, file),
					);
				}
			}
			const sitemap = path.resolve(__dirname, 'sitemap');
			if (existsSync(sitemap)) {
				mkdirSync(path.join(out, 'sitemap'), { recursive: true });
				for (const file of readdirSync(sitemap)) {
					if (file.endsWith('.mjs')) {
						copyFileSync(
							path.join(sitemap, file),
							path.join(out, 'sitemap', file),
						);
					}
				}
			}
			cpSync(
				path.resolve(__dirname, 'src/components'),
				path.join(out, 'components'),
				{
					recursive: true,
					filter: (src) =>
						!src.endsWith('.ts') && !src.endsWith('.tsx'),
				},
			);
		},
	};
}

export default defineConfig({
	root: __dirname,
	cacheDir: '../../../node_modules/.vite/npm/astro',

	server: {
		fs: {
			allow: [path.resolve(__dirname, '../../..')],
		},
	},

	plugins: [
		react(),
		tsconfigPaths(),
		copyAssets(),
		dts({
			entryRoot: 'src',
			tsconfigPath: path.join(__dirname, 'tsconfig.lib.json'),
			outDir: '../../../dist/packages/npm/astro',
		}),
	],

	build: {
		outDir: '../../../dist/packages/npm/astro',
		reportCompressedSize: true,
		lib: {
			entry,
			// The entry keys are already the paths the export map names, so the
			// format does not belong in the filename -- 'astro.es' carries it.
			fileName: (_format, entryName) => `${entryName}.js`,
			formats: ['es'],
		},
		rollupOptions: {
			external: [
				'react',
				'react-dom',
				'react/jsx-runtime',
				'astro',
				'@kbve/droid',
				'd3-force',
				'nanostores',
				'@nanostores/react',
				'lucide-react',
			],
			output: {
				globals: {
					react: 'React',
					'react-dom': 'ReactDOM',
				},
			},
		},
	},

	test: {
		globals: true,
		watch: false,
		environment: 'jsdom',
		passWithNoTests: true,
		include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
		reporters: ['default'],
		coverage: {
			reportsDirectory: '../../../coverage/packages/npm/astro',
			provider: 'v8',
		},
	},
});
