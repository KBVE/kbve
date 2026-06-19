// Zero-dependency CI shim: compute the "Builds on merge" section for the
// dev->main release PR.
//
// A package "will build on merge" when its version_source (the human-bumped
// file, e.g. an .mdx frontmatter) is semver-newer than its version_toml (the
// CI-maintained "published" marker). This mirrors the version gate in
// .github/workflows/ci-main.yml (is_newer / check_version) so the section
// predicts what ci-main.yml dispatches post-merge. Scope: mdx-sourced types
// only (docker, npm, python, and crates whose version_source ends in .mdx).
//
// Pure + fs-only; no npm deps (the PR job runs without `pnpm install`).

const MDX_TYPES = ['docker', 'npm', 'python', 'crates'];

/** Extract the frontmatter `version:` from an .mdx file. */
export function parseMdxVersion(text) {
	if (!text) return '0.0.0';
	// Restrict to the frontmatter block (between the first two `---` fences)
	// so a stray "version:" in the body can't match.
	const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	const scope = fm ? fm[1] : text;
	const m = scope.match(/^\s*version:\s*["']?([^"'\r\n]+?)["']?\s*$/m);
	return m ? m[1].trim() : '0.0.0';
}

/** Extract `version = "..."` from a version.toml. */
export function parseTomlVersion(text) {
	if (!text) return '0.0.0';
	const m = text.match(/^\s*version\s*=\s*"([^"]+)"/m);
	return m ? m[1].trim() : '0.0.0';
}

/** Extract the `publish` flag from a version.toml (defaults to true). */
export function parseTomlPublish(text) {
	if (!text) return true;
	const m = text.match(/^\s*publish\s*=\s*(\w+)/m);
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
	const a = localV.split('.').map((n) => parseInt(n, 10) || 0);
	const b = pubV.split('.').map((n) => parseInt(n, 10) || 0);
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
 * Compute the list of mdx-sourced packages that will build on merge.
 *
 * @param {string} manifestPath - path to .github/ci-dispatch-manifest.json
 * @param {string} repoRoot - repo root (e.g. process.cwd())
 * @param {{readFileSync: Function}} fs - node fs module
 * @returns {Array<{name: string, type: string, version: string, source: string}>}
 */
export function computeMdxBuilds(manifestPath, repoRoot, fs) {
	const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
	const builds = [];

	for (const type of MDX_TYPES) {
		for (const entry of manifest[type] || []) {
			const source = entry.version_source;
			if (!source || !source.endsWith('.mdx')) continue;

			const sourceText = readFileOrNull(fs, `${repoRoot}/${source}`);
			if (sourceText == null) continue;
			const sourceV = parseMdxVersion(sourceText);

			const tomlText = entry.version_toml
				? readFileOrNull(fs, `${repoRoot}/${entry.version_toml}`)
				: null;
			if (!parseTomlPublish(tomlText)) continue;
			const pubV = parseTomlVersion(tomlText);

			if (isNewer(sourceV, pubV)) {
				builds.push({ name: nameOf(entry), type, version: sourceV, source });
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
 * @param {Array<{name,type,version,source}>} builds
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
		const file = b.source.split('/').pop();
		const url = `https://github.com/${owner}/${repo}/blob/${ref}/${b.source}`;
		out += `| ${b.name} | ${b.type} | v${b.version} | [${file}](${url}) |\n`;
	}
	return out.trimEnd();
}
