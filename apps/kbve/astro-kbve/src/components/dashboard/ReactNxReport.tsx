import { useEffect, useMemo, useState } from 'react';
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';

interface NxReportData {
	generated_at: string;
	environment: { node: string; nx: string; pnpm: string; os: string };
	nx_report: string;
	loc_stats: string;
	coverage: string | null;
}

interface LocEntry {
	language: string;
	files: number;
	lines: number;
	blanks: number;
	comments: number;
	code: number;
	complexity: number;
}

interface PluginEntry {
	name: string;
	version: string;
	community: boolean;
}

interface CoverageEntry {
	project: string;
	statements: number;
	branches: number;
	functions: number;
	lines: number;
}

const LANG_COLORS: Record<string, string> = {
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

const colorFor = (lang: string) => LANG_COLORS[lang] ?? '#475569';

function parseLocStats(raw: string): LocEntry[] {
	const lines = raw.split('\n');
	const out: LocEntry[] = [];
	for (const line of lines) {
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

function parsePlugins(raw: string): {
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

function parseCacheUsage(raw: string): { used: string; total: string } | null {
	const m = raw.match(/Cache Usage:\s*([\d.]+\s*\S+)\s*\/\s*([\d.]+\s*\S+)/);
	return m ? { used: m[1], total: m[2] } : null;
}

function parseCoverage(raw: string): CoverageEntry[] {
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

function parseTestCount(raw: string): { passed: number; files: number } {
	let passed = 0;
	let files = 0;
	for (const m of raw.matchAll(/Tests\s+(\d+)\s+passed\s+\((\d+)\)/g))
		passed += +m[1];
	for (const m of raw.matchAll(/Test Files\s+(\d+)\s+passed\s+\((\d+)\)/g))
		files += +m[1];
	return { passed, files };
}

function CoveragePill({ value }: { value: number }) {
	const color = value >= 80 ? '#10b981' : value >= 60 ? '#f59e0b' : '#ef4444';
	return (
		<div
			style={{
				background: '#1e293b',
				borderRadius: 6,
				height: 8,
				position: 'relative',
				overflow: 'hidden',
			}}>
			<div
				style={{
					background: color,
					width: `${Math.min(100, value)}%`,
					height: '100%',
					transition: 'width 200ms ease',
				}}
			/>
		</div>
	);
}

function CoverageCard({ entry }: { entry: CoverageEntry }) {
	const rows: Array<[string, number]> = [
		['Statements', entry.statements],
		['Branches', entry.branches],
		['Functions', entry.functions],
		['Lines', entry.lines],
	];
	const avg =
		(entry.statements + entry.branches + entry.functions + entry.lines) / 4;
	const avgColor = avg >= 80 ? '#10b981' : avg >= 60 ? '#f59e0b' : '#ef4444';
	return (
		<div
			style={{
				background: 'rgba(15,23,42,0.6)',
				border: '1px solid rgba(148,163,184,0.18)',
				borderRadius: 10,
				padding: '14px 16px',
				display: 'flex',
				flexDirection: 'column',
				gap: 8,
			}}>
			<div
				style={{
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'baseline',
				}}>
				<span style={{ fontWeight: 600, color: '#e2e8f0' }}>
					{entry.project}
				</span>
				<span style={{ color: avgColor, fontWeight: 600 }}>
					{avg.toFixed(1)}%
				</span>
			</div>
			{rows.map(([label, value]) => (
				<div key={label} style={{ display: 'grid', gap: 4 }}>
					<div
						style={{
							display: 'flex',
							justifyContent: 'space-between',
							fontSize: 12,
							color: '#94a3b8',
						}}>
						<span>{label}</span>
						<span>{value.toFixed(1)}%</span>
					</div>
					<CoveragePill value={value} />
				</div>
			))}
		</div>
	);
}

function LocChart({ entries }: { entries: LocEntry[] }) {
	const top = entries.slice(0, 15);
	return (
		<ResponsiveContainer width="100%" height={420}>
			<BarChart
				data={top}
				layout="vertical"
				margin={{ top: 8, right: 24, left: 12, bottom: 8 }}>
				<CartesianGrid stroke="rgba(148,163,184,0.08)" />
				<XAxis
					type="number"
					stroke="#64748b"
					tick={{ fontSize: 11, fill: '#94a3b8' }}
				/>
				<YAxis
					dataKey="language"
					type="category"
					width={140}
					stroke="#64748b"
					tick={{ fontSize: 11, fill: '#cbd5e1' }}
				/>
				<Tooltip
					cursor={{ fill: 'rgba(148,163,184,0.05)' }}
					contentStyle={{
						background: '#0f172a',
						border: '1px solid rgba(148,163,184,0.2)',
						borderRadius: 6,
						color: '#e2e8f0',
					}}
					formatter={(v: number) => v.toLocaleString()}
				/>
				<Bar dataKey="code" name="Lines of code" radius={[0, 4, 4, 0]}>
					{top.map((e) => (
						<Cell key={e.language} fill={colorFor(e.language)} />
					))}
				</Bar>
			</BarChart>
		</ResponsiveContainer>
	);
}

function StatTile({
	label,
	value,
	sub,
}: {
	label: string;
	value: string | number;
	sub?: string;
}) {
	return (
		<div
			style={{
				background: 'rgba(15,23,42,0.6)',
				border: '1px solid rgba(148,163,184,0.18)',
				borderRadius: 10,
				padding: '14px 16px',
				minWidth: 140,
			}}>
			<div
				style={{
					fontSize: 11,
					color: '#94a3b8',
					textTransform: 'uppercase',
					letterSpacing: '0.05em',
				}}>
				{label}
			</div>
			<div
				style={{
					fontSize: 22,
					fontWeight: 600,
					color: '#e2e8f0',
					marginTop: 4,
				}}>
				{value}
			</div>
			{sub && (
				<div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
					{sub}
				</div>
			)}
		</div>
	);
}

function PluginGroup({
	title,
	plugins,
}: {
	title: string;
	plugins: PluginEntry[];
}) {
	if (!plugins.length) return null;
	return (
		<div>
			<div
				style={{
					fontSize: 12,
					color: '#94a3b8',
					textTransform: 'uppercase',
					letterSpacing: '0.05em',
					marginBottom: 8,
				}}>
				{title}
			</div>
			<div
				style={{
					display: 'flex',
					flexWrap: 'wrap',
					gap: 8,
				}}>
				{plugins.map((p) => (
					<span
						key={p.name}
						style={{
							background: 'rgba(15,23,42,0.6)',
							border: '1px solid rgba(148,163,184,0.18)',
							borderRadius: 6,
							padding: '4px 10px',
							fontSize: 12,
							color: '#e2e8f0',
							fontFamily: 'monospace',
						}}>
						<span style={{ color: '#cbd5e1' }}>{p.name}</span>
						<span
							style={{
								color: '#64748b',
								marginLeft: 6,
							}}>
							{p.version}
						</span>
					</span>
				))}
			</div>
		</div>
	);
}

function Skeleton() {
	return (
		<div
			style={{
				padding: 32,
				color: '#94a3b8',
				fontFamily: 'monospace',
				fontSize: 13,
			}}>
			Loading workspace report…
		</div>
	);
}

export default function ReactNxReport() {
	const [data, setData] = useState<NxReportData | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		fetch('/data/nx/nx-report.json')
			.then((r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return r.json();
			})
			.then(setData)
			.catch((e) => setError(String(e?.message ?? e)));
	}, []);

	const parsed = useMemo(() => {
		if (!data) return null;
		return {
			loc: parseLocStats(data.loc_stats ?? ''),
			plugins: parsePlugins(data.nx_report ?? ''),
			cache: parseCacheUsage(data.nx_report ?? ''),
			coverage: parseCoverage(data.coverage ?? ''),
			tests: parseTestCount(data.coverage ?? ''),
		};
	}, [data]);

	if (error)
		return (
			<div style={{ padding: 16, color: '#ef4444', fontSize: 13 }}>
				Failed to load report: {error}
			</div>
		);
	if (!data || !parsed) return <Skeleton />;

	const totalCode = parsed.loc.reduce((s, e) => s + e.code, 0);
	const totalFiles = parsed.loc.reduce((s, e) => s + e.files, 0);

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
			<div
				style={{
					display: 'flex',
					flexWrap: 'wrap',
					gap: 12,
				}}>
				<StatTile
					label="Lines of code"
					value={totalCode.toLocaleString()}
					sub={`${parsed.loc.length} languages`}
				/>
				<StatTile
					label="Source files"
					value={totalFiles.toLocaleString()}
				/>
				<StatTile
					label="Tests passing"
					value={parsed.tests.passed.toLocaleString()}
					sub={`${parsed.tests.files} files`}
				/>
				{parsed.cache && (
					<StatTile
						label="Nx cache"
						value={parsed.cache.used}
						sub={`of ${parsed.cache.total}`}
					/>
				)}
			</div>

			<section
				style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
				<h3 style={{ margin: 0, color: '#e2e8f0' }}>
					Top 15 languages by code volume
				</h3>
				<LocChart entries={parsed.loc} />
			</section>

			{parsed.coverage.length > 0 && (
				<section
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: 12,
					}}>
					<h3 style={{ margin: 0, color: '#e2e8f0' }}>
						Coverage by package
					</h3>
					<div
						style={{
							display: 'grid',
							gridTemplateColumns:
								'repeat(auto-fit, minmax(240px, 1fr))',
							gap: 12,
						}}>
						{parsed.coverage.map((c) => (
							<CoverageCard key={c.project} entry={c} />
						))}
					</div>
				</section>
			)}

			<section
				style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
				<h3 style={{ margin: 0, color: '#e2e8f0' }}>Nx plugins</h3>
				<PluginGroup
					title={`Built-in (${parsed.plugins.builtin.length})`}
					plugins={parsed.plugins.builtin}
				/>
				<PluginGroup
					title={`Community (${parsed.plugins.community.length})`}
					plugins={parsed.plugins.community}
				/>
			</section>
		</div>
	);
}
