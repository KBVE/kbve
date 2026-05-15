export interface NxReportData {
	generated_at: string;
	environment: { node: string; nx: string; pnpm: string; os: string };
	nx_report: string;
	loc_stats: string;
	coverage: string | null;
}

export interface LocEntry {
	language: string;
	files: number;
	lines: number;
	blanks: number;
	comments: number;
	code: number;
	complexity: number;
}

export interface PluginEntry {
	name: string;
	version: string;
	community: boolean;
}

export interface CoverageEntry {
	project: string;
	statements: number;
	branches: number;
	functions: number;
	lines: number;
}

export const NX_LANG_COLORS: Record<string, string> = {
	MDX: '#f59e0b',
	TypeScript: '#3178c6',
	'C#': '#9b4dca',
	Rust: '#dea584',
	YAML: '#ef4444',
	JSON: '#64748b',
	Astro: '#ff5d01',
	'C Header': '#94a3b8',
	SQL: '#0891b2',
	Markdown: '#e2e8f0',
	Python: '#3776ab',
	TOML: '#a78bfa',
	JavaScript: '#f7df1e',
	C: '#a8b9cc',
	'C++': '#00599c',
	Java: '#ed8b00',
	HTML: '#e34c26',
	Shell: '#4eaa25',
	'Protocol Buffers': '#4285f4',
};

export const colorForLanguage = (lang: string) =>
	NX_LANG_COLORS[lang] ?? '#475569';

export function parseLocStats(raw: string): LocEntry[] {
	const out: LocEntry[] = [];
	for (const line of raw.split('\n')) {
		if (!/^\S/.test(line)) continue;
		if (line.startsWith('Total')) continue;
		if (line.startsWith('Language') || line.startsWith('Processed'))
			continue;
		if (line.startsWith('─')) continue;
		const m = line.match(
			/^(.+?)\s{2,}(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/,
		);
		if (!m) continue;
		out.push({
			language: m[1].trim().replace(/…$/, ''),
			files: +m[2],
			lines: +m[3],
			blanks: +m[4],
			comments: +m[5],
			code: +m[6],
			complexity: +m[7],
		});
	}
	out.sort((a, b) => b.code - a.code);
	return out;
}

export function parsePlugins(raw: string): {
	builtin: PluginEntry[];
	community: PluginEntry[];
} {
	const builtin: PluginEntry[] = [];
	const community: PluginEntry[] = [];
	let mode: 'builtin' | 'community' | null = null;
	for (const line of raw.split('\n')) {
		const trimmed = line.trim();
		if (trimmed.startsWith('Community plugins:')) {
			mode = 'community';
			continue;
		}
		if (
			!mode &&
			(trimmed.startsWith('nx ') || trimmed.startsWith('@nx/'))
		) {
			mode = 'builtin';
		}
		if (!mode) continue;
		const m = line.match(/^(@?[\w/.-]+)\s*:\s*(\S+)\s*$/);
		if (!m) continue;
		if (m[1] === 'typescript') break;
		(mode === 'community' ? community : builtin).push({
			name: m[1],
			version: m[2],
			community: mode === 'community',
		});
	}
	return { builtin, community };
}

export function parseCacheUsage(
	raw: string,
): { used: string; total: string } | null {
	const m = raw.match(/Cache Usage:\s*([\d.]+\s*\S+)\s*\/\s*([\d.]+\s*\S+)/);
	return m ? { used: m[1], total: m[2] } : null;
}

export function parseCoverage(raw: string): CoverageEntry[] {
	const groups = raw.split(/::group::\s*[✅❌]?\s*> nx run /);
	const out: CoverageEntry[] = [];
	for (const group of groups.slice(1)) {
		const projMatch = group.match(/^([\w-]+):coverage/);
		if (!projMatch) continue;
		const project = projMatch[1];
		const all = group.match(
			/All files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/,
		);
		if (!all) continue;
		out.push({
			project,
			statements: +all[1],
			branches: +all[2],
			functions: +all[3],
			lines: +all[4],
		});
	}
	out.sort((a, b) => a.project.localeCompare(b.project));
	return out;
}

export function parseTestCount(raw: string): { passed: number; files: number } {
	let passed = 0;
	let files = 0;
	for (const m of raw.matchAll(/Tests\s+(\d+)\s+passed\s+\((\d+)\)/g))
		passed += +m[1];
	for (const m of raw.matchAll(/Test Files\s+(\d+)\s+passed\s+\((\d+)\)/g))
		files += +m[1];
	return { passed, files };
}

export function coverageColor(value: number): string {
	return value >= 80 ? '#10b981' : value >= 60 ? '#f59e0b' : '#ef4444';
}

export function coverageAverage(entry: CoverageEntry): number {
	return (
		(entry.statements + entry.branches + entry.functions + entry.lines) / 4
	);
}
