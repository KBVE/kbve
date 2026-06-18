import { readFileSync, appendFileSync } from 'node:fs';

const MANIFEST = '.github/ci-dispatch-manifest.json';
const BUILD_PLATFORMS = ['Linux', 'Win64'];

const mode = (process.env.MODE || 'changed').trim();
const ueImageTag = (process.env.UE_IMAGE_TAG || 'dev-5.7.4').trim();
const changedRaw = process.env.CHANGED_FILES || '';

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const plugins = manifest.unreal || [];

const byPath = new Map(plugins.map((p) => [p.plugin_path, p]));

function depPaths(p) {
	return (p.dependency_plugins || '')
		.split(/\s+/)
		.map((s) => s.trim())
		.filter(Boolean);
}

function selectAll() {
	return new Set(plugins.map((p) => p.plugin_path));
}

function selectChanged() {
	const changed = changedRaw
		.split('\n')
		.map((s) => s.trim())
		.filter(Boolean);

	const direct = new Set();
	for (const p of plugins) {
		const prefix = p.plugin_path.endsWith('/')
			? p.plugin_path
			: `${p.plugin_path}/`;
		if (changed.some((f) => f === p.plugin_path || f.startsWith(prefix))) {
			direct.add(p.plugin_path);
		}
	}

	const selected = new Set(direct);
	let grew = true;
	while (grew) {
		grew = false;
		for (const p of plugins) {
			if (selected.has(p.plugin_path)) continue;
			if (depPaths(p).some((d) => selected.has(d))) {
				selected.add(p.plugin_path);
				grew = true;
			}
		}
	}
	return selected;
}

const selectedPaths = mode === 'all' ? selectAll() : selectChanged();

const linux = [];
const win = [];
for (const p of plugins) {
	if (!selectedPaths.has(p.plugin_path)) continue;
	const platforms = (p.supported_platforms || []).filter((pl) =>
		BUILD_PLATFORMS.includes(pl),
	);
	for (const platform of platforms) {
		const entry = {
			key: p.key,
			plugin_name: p.plugin_name,
			plugin_path: p.plugin_path,
			dependency_plugins: p.dependency_plugins || '',
			ue_image_tag: ueImageTag,
			platform,
		};
		if (platform === 'Linux') linux.push(entry);
		else if (platform === 'Win64') win.push(entry);
	}
}

const out = process.env.GITHUB_OUTPUT;
const write = (k, v) => appendFileSync(out, `${k}=${v}\n`);

write('linux', JSON.stringify({ include: linux }));
write('win', JSON.stringify({ include: win }));
write('has_linux', String(linux.length > 0));
write('has_win', String(win.length > 0));

const names = [...selectedPaths].sort().join(', ') || '(none)';
console.log(`mode=${mode} selected=${selectedPaths.size}`);
console.log(`linux=${linux.length} win=${win.length}`);
console.log(`plugins: ${names}`);
