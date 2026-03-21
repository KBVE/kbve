import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { forgejoService, formatSize, langColor } from './forgejoService';
import {
	Loader2,
	AlertTriangle,
	HardDrive,
	BookOpen,
	Users,
	Tag,
	Lock,
	Archive,
} from 'lucide-react';

function StatCard({
	icon,
	label,
	value,
	color,
	sub,
}: {
	icon: React.ReactNode;
	label: string;
	value: string | number;
	color: string;
	sub?: string;
}) {
	return (
		<div
			style={{
				flex: '1 1 180px',
				padding: '1rem 1.1rem',
				borderRadius: 10,
				background: 'var(--sl-color-gray-6, #161b22)',
				border: '1px solid var(--sl-color-gray-5, #30363d)',
				display: 'flex',
				flexDirection: 'column',
				gap: 6,
			}}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 6,
					color: 'var(--sl-color-gray-3, #8b949e)',
					fontSize: '0.7rem',
					textTransform: 'uppercase',
					letterSpacing: '0.05em',
					fontWeight: 600,
				}}>
				{icon}
				{label}
			</div>
			<div
				style={{
					fontSize: '1.75rem',
					fontWeight: 700,
					color,
					lineHeight: 1.2,
				}}>
				{value}
			</div>
			{sub && (
				<div
					style={{
						fontSize: '0.7rem',
						color: 'var(--sl-color-gray-3, #8b949e)',
					}}>
					{sub}
				</div>
			)}
		</div>
	);
}

function StorageBreakdown() {
	const repos = useStore(forgejoService.$repos);

	if (repos.length === 0) return null;

	const sorted = [...repos].sort((a, b) => b.size - a.size);
	const totalSize = sorted.reduce((s, r) => s + r.size, 0);
	const top = sorted.slice(0, 8);

	return (
		<div style={{ marginBottom: '1.5rem' }}>
			<div
				style={{
					fontSize: '0.75rem',
					fontWeight: 600,
					color: 'var(--sl-color-gray-3, #8b949e)',
					marginBottom: 8,
					textTransform: 'uppercase',
					letterSpacing: '0.05em',
					display: 'flex',
					alignItems: 'center',
					gap: 4,
				}}>
				<HardDrive size={12} />
				Storage by Repository
			</div>
			{/* Stacked bar */}
			<div
				style={{
					display: 'flex',
					height: 10,
					borderRadius: 5,
					overflow: 'hidden',
					background: 'var(--sl-color-gray-5, #30363d)',
					marginBottom: 8,
				}}>
				{top.map((repo, i) => {
					const pct =
						totalSize > 0 ? (repo.size / totalSize) * 100 : 0;
					const hue = [200, 160, 280, 30, 340, 120, 50, 240][i % 8];
					return (
						<div
							key={repo.id}
							title={`${repo.full_name}: ${formatSize(repo.size)}`}
							style={{
								width: `${pct}%`,
								background: `hsl(${hue}, 60%, 55%)`,
								minWidth: pct > 0 ? 3 : 0,
							}}
						/>
					);
				})}
			</div>
			{/* Legend */}
			<div
				style={{
					display: 'flex',
					flexWrap: 'wrap',
					gap: '0.4rem 1rem',
				}}>
				{top.map((repo, i) => {
					const hue = [200, 160, 280, 30, 340, 120, 50, 240][i % 8];
					return (
						<div
							key={repo.id}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 4,
								fontSize: '0.72rem',
								color: 'var(--sl-color-gray-3, #8b949e)',
							}}>
							<span
								style={{
									width: 8,
									height: 8,
									borderRadius: '50%',
									background: `hsl(${hue}, 60%, 55%)`,
									flexShrink: 0,
								}}
							/>
							{repo.name}
							<span style={{ opacity: 0.6, fontSize: '0.65rem' }}>
								{formatSize(repo.size)}
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function LanguageBar() {
	const langs = useStore(forgejoService.$languageBreakdown);
	const totalRepos = useStore(forgejoService.$totalRepos);

	if (langs.length === 0) return null;

	return (
		<div style={{ marginBottom: '1.5rem' }}>
			<div
				style={{
					fontSize: '0.75rem',
					fontWeight: 600,
					color: 'var(--sl-color-gray-3, #8b949e)',
					marginBottom: 8,
					textTransform: 'uppercase',
					letterSpacing: '0.05em',
				}}>
				Languages
			</div>
			<div
				style={{
					display: 'flex',
					height: 8,
					borderRadius: 4,
					overflow: 'hidden',
					background: 'var(--sl-color-gray-5, #30363d)',
				}}>
				{langs.map(([lang, count]) => (
					<div
						key={lang}
						title={`${lang}: ${count} repo${count > 1 ? 's' : ''}`}
						style={{
							width: `${(count / totalRepos) * 100}%`,
							background: langColor(lang),
							minWidth: 3,
						}}
					/>
				))}
			</div>
			<div
				style={{
					display: 'flex',
					flexWrap: 'wrap',
					gap: '0.4rem 1rem',
					marginTop: 8,
				}}>
				{langs.map(([lang, count]) => (
					<div
						key={lang}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 4,
							fontSize: '0.72rem',
							color: 'var(--sl-color-gray-3, #8b949e)',
						}}>
						<span
							style={{
								width: 8,
								height: 8,
								borderRadius: '50%',
								background: langColor(lang),
								flexShrink: 0,
							}}
						/>
						{lang}
						<span style={{ opacity: 0.6 }}>{count}</span>
					</div>
				))}
			</div>
		</div>
	);
}

export default function ReactForgejoSummary() {
	const loading = useStore(forgejoService.$loading);
	const error = useStore(forgejoService.$error);
	const totalRepos = useStore(forgejoService.$totalRepos);
	const privateCount = useStore(forgejoService.$privateCount);
	const publicCount = useStore(forgejoService.$publicCount);
	const archivedCount = useStore(forgejoService.$archivedCount);
	const totalUsers = useStore(forgejoService.$totalUsers);
	const totalSize = useStore(forgejoService.$totalSize);
	const totalReleases = useStore(forgejoService.$totalReleases);

	useEffect(() => {
		forgejoService.loadCacheAndFetch();
	}, []);

	if (loading && totalRepos === 0) {
		return (
			<div
				className="not-content"
				style={{
					display: 'flex',
					justifyContent: 'center',
					padding: '2rem',
				}}>
				<Loader2
					size={24}
					style={{
						animation: 'spin 1s linear infinite',
						color: 'var(--sl-color-accent, #06b6d4)',
					}}
				/>
			</div>
		);
	}

	return (
		<div className="not-content">
			{error && (
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 8,
						padding: '0.75rem 1rem',
						borderRadius: 8,
						background: 'rgba(239, 68, 68, 0.1)',
						border: '1px solid rgba(239, 68, 68, 0.3)',
						marginBottom: '1rem',
						fontSize: '0.85rem',
						color: '#ef4444',
					}}>
					<AlertTriangle size={16} />
					{error}
				</div>
			)}

			{/* Primary stats — storage focused */}
			<div
				style={{
					display: 'flex',
					gap: '0.75rem',
					flexWrap: 'wrap',
					marginBottom: '1.5rem',
				}}>
				<StatCard
					icon={<HardDrive size={12} />}
					label="Total Storage"
					value={formatSize(totalSize)}
					color="#06b6d4"
					sub={`across ${totalRepos} repositories`}
				/>
				<StatCard
					icon={<BookOpen size={12} />}
					label="Repositories"
					value={totalRepos}
					color="#22c55e"
					sub={`${publicCount} public · ${privateCount} private${archivedCount > 0 ? ` · ${archivedCount} archived` : ''}`}
				/>
				<StatCard
					icon={<Tag size={12} />}
					label="Releases"
					value={totalReleases}
					color="#8b5cf6"
					sub="build artifacts & assets"
				/>
				<StatCard
					icon={<Users size={12} />}
					label="Users"
					value={totalUsers}
					color="#f59e0b"
				/>
			</div>

			{/* Storage breakdown by repo */}
			<StorageBreakdown />

			{/* Language breakdown */}
			<LanguageBar />
		</div>
	);
}
