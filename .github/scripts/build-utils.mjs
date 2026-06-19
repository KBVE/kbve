// Zero-dependency CI shim: compute the "Builds on merge" section for the
// dev->main release PR.
//
// Predicts what ci-main.yml dispatches post-merge by mirroring its version
// gate (is_newer / check_version). Covers both gated mechanisms:
//   - mdx source — any type whose version_source ends in .mdx (docker, npm,
//     crates, python, unity, godot, unreal_game).
//   - unreal plugins — manifest .version vs plugin version.toml.
// File-change (is_altered) dispatches are intentionally excluded.
//
// Pure + fs-only; no npm deps (the PR job runs without `pnpm install`).

/** Frontmatter `version: "..."` from an .mdx — double-quoted, column 0, mirroring ci-main.yml. */
export function parseMdxVersion(text) {
	if (!text) return '0.0.0';
	const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	const scope = fm ? fm[1] : text;
	const m = scope.match(/^version: *"([^"]*)"/m);
	return m && m[1] ? m[1].trim() : '0.0.0';
}

/** Extract `version = "..."` from a version.toml. */
export function parseTomlVersion(text) {
	if (!text) return '0.0.0';
	const m = text.match(/^\s*version\s*=\s*"([^"]+)"/m);
	return m ? m[1].trim() : '0.0.0';
}

/** `publish` flag from a version.toml (defaults to true) — column 0, quotes stripped. */
export function parseTomlPublish(text) {
	if (!text) return true;
	const m = text.match(/^publish[ \t]*=[ \t]*['"]?(\w+)/m);
	return m ? m[1].toLowerCase() !== 'false' : true;
}

/**
 * Mirror ci-main.yml's is_newer(): true only when local is a real version
 * strictly greater than pub. Treats empty / "0.0.0" on either side as
 * "not ready" -> false.
 */
export function isNewer(localV, pubV) {
	if (!localV || localV === '0.0.0') return false;
	if (!pubV || pubV === '0.0.0') return false;
	if (localV === pubV) return false;
	// Strip a leading `v` before splitting, matching ci-main.yml's `sort -V`.
	const norm = (s) => s.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
	const a = norm(localV);
	const b = norm(pubV);
	const len = Math.max(a.length, b.length);
	for (let i = 0; i < len; i++) {
		const x = a[i] || 0;
		const y = b[i] || 0;
		if (x > y) return true;
		if (x < y) return false;
	}
	return false;
}

function nameOf(entry) {
	return entry.app_name || entry.package_name || entry.plugin_name || entry.key || '(unknown)';
}

function readFileOrNull(fs, p) {
	try {
		return fs.readFileSync(p, 'utf8');
	} catch {
		return null;
	}
}

/**
 * Compute the packages that will build on merge — every type ci-main.yml
 * version-gate-dispatches.
 *
 * The manifest and version_source (mdx) are read from the head tree (dev, via
 * `fs`); version_toml is the published tracker maintained on the base branch
 * (main), so it is read via `readBaseToml` — that is the baseline ci-main.yml
 * gates against post-merge. Without `readBaseToml`, the toml is read from the
 * head tree (used by unit tests).
 *
 * @param {string} manifestPath - path to .github/ci-dispatch-manifest.json
 * @param {string} repoRoot - repo root (e.g. process.cwd())
 * @param {{readFileSync: Function}} fs - node fs module
 * @param {(path: string) => (string|null)} [readBaseToml] - reads a version.toml from base (main)
 * @returns {Array<{name: string, type: string, from: string, version: string, source: string}>}
 */
export function computeBuilds(manifestPath, repoRoot, fs, readBaseToml) {
	let manifest;
	try {
		manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
	} catch {
		return [];
	}
	const readToml = readBaseToml || ((p) => readFileOrNull(fs, `${repoRoot}/${p}`));
	const builds = [];

	for (const type of Object.keys(manifest)) {
		const entries = manifest[type];
		if (!Array.isArray(entries)) continue;
		for (const entry of entries) {
			// Resolve the local version and a path to link, per dispatch mechanism.
			let localV, source;
			if (entry.version_source && entry.version_source.endsWith('.mdx')) {
				const text = readFileOrNull(fs, `${repoRoot}/${entry.version_source}`);
				if (text == null) continue;
				localV = parseMdxVersion(text);
				source = entry.version_source;
			} else if (type === 'unreal' && entry.plugin_path) {
				localV = entry.version || '0.0.0';
				source = entry.plugin_path;
			} else {
				continue;
			}

			const tomlText = entry.version_toml ? readToml(entry.version_toml) : null;
			if (!parseTomlPublish(tomlText)) continue;
			const pubV = parseTomlVersion(tomlText);

			if (isNewer(localV, pubV)) {
				builds.push({ name: nameOf(entry), type, from: pubV, version: localV, source });
			}
		}
	}

	builds.sort((x, y) => x.type.localeCompare(y.type) || x.name.localeCompare(y.name));
	return builds;
}

/**
 * Render the "Builds on merge" markdown section. Returns '' when there are no
 * builds (so the caller omits the section entirely).
 *
 * @param {Array<{name,type,from,version,source}>} builds
 * @param {string} owner
 * @param {string} repo
 * @param {string} ref - blob ref for the source link (e.g. the dev head sha)
 * @returns {string}
 */
export function formatBuildsTable(builds, owner, repo, ref) {
	if (!builds || builds.length === 0) return '';
	let out = `### Builds on merge\n\n`;
	out += `| Package | Type | Version | Source |\n|---|---|---|---|\n`;
	for (const b of builds) {
		const seg = b.source.split('/').pop();
		const kind = b.source.endsWith('.mdx') ? 'blob' : 'tree';
		const url = `https://github.com/${owner}/${repo}/${kind}/${ref}/${b.source}`;
		out += `| ${b.name} | ${b.type} | v${b.from} → v${b.version} | [${seg}](${url}) |\n`;
	}
	return out.trimEnd();
}
