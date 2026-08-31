export interface ToolchainEntry {
	name: string;
	version: string;
}

export interface WorkspaceStats {
	projects: number;
	tasks: number;
	by_language: Record<string, number>;
}

export interface WorkspaceReportData {
	generated_at: string;
	toolchain: ToolchainEntry[];
	workspace: WorkspaceStats;
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

export interface CoverageEntry {
	project: string;
	statements: number;
	branches: number;
	functions: number;
	lines: number;
}

export const LANG_COLORS: Record<string, string> = {
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
	LANG_COLORS[lang] ?? '#475569';

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

export function parseCoverage(raw: string): CoverageEntry[] {
	// moon prefixes every line with `<project>:<task> | ` when it runs more than
	// one target, so the output of four coverage runs arrives interleaved rather
	// than in blocks. Grouping by that prefix puts each project's lines back
	// together; a single-target run has no prefix and is handled below.
	const byProject = new Map<string, string[]>();
	for (const line of raw.split('\n')) {
		const m = line.match(/^\s*([\w-]+):coverage\s*\|\s?(.*)$/);
		if (!m) continue;
		const lines = byProject.get(m[1]) ?? [];
		lines.push(m[2]);
		byProject.set(m[1], lines);
	}

	const ALL_FILES =
		/All files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/;

	const out: CoverageEntry[] = [];
	const push = (project: string, text: string) => {
		const all = text.match(ALL_FILES);
		if (!all) return;
		out.push({
			project,
			statements: +all[1],
			branches: +all[2],
			functions: +all[3],
			lines: +all[4],
		});
	};

	if (byProject.size > 0) {
		for (const [project, lines] of byProject)
			push(project, lines.join('\n'));
	} else {
		// One target: no prefix, so the project name comes from vitest's own
		// header, which prints the directory it ran in.
		const run = raw.match(/RUN\s+v[\d.]+\s+\S*\/([\w-]+)\s*$/m);
		if (run) push(run[1], raw);
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
