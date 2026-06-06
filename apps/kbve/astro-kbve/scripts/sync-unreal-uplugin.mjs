import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const REGISTRY = 'dist/apps/astro-kbve/api/ci-registry.json';
const checkOnly = process.argv.includes('--check');

if (!existsSync(REGISTRY)) {
	console.error(`Build output not found: ${REGISTRY} — run astro-kbve:build first`);
	process.exit(1);
}

const registry = JSON.parse(readFileSync(REGISTRY, 'utf8'));
const plugins = registry.unreal ?? [];

const drift = [];
let written = 0;

for (const plugin of plugins) {
	const { plugin_name, plugin_path, version } = plugin;
	if (!plugin_name || !plugin_path || !version) continue;

	const upluginPath = `${plugin_path}/${plugin_name}.uplugin`;
	if (!existsSync(upluginPath)) {
		console.warn(`Missing .uplugin: ${upluginPath}`);
		continue;
	}

	const uplugin = JSON.parse(readFileSync(upluginPath, 'utf8'));
	if (uplugin.VersionName === version) continue;

	drift.push(`${plugin_name}: uplugin=${uplugin.VersionName} mdx=${version}`);

	if (!checkOnly) {
		uplugin.VersionName = version;
		writeFileSync(upluginPath, JSON.stringify(uplugin, null, '\t') + '\n');
		written++;
	}
}

if (checkOnly) {
	if (drift.length) {
		console.error('uplugin VersionName drift from MDX version:');
		for (const line of drift) console.error(`  ${line}`);
		console.error('Run: npx nx run astro-kbve:sync:unreal');
		process.exit(1);
	}
	console.log(`All ${plugins.length} uplugin VersionNames match MDX.`);
} else {
	console.log(`Synced ${written} uplugin VersionName(s) from MDX (${plugins.length} plugins checked).`);
}
