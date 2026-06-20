import { useMemo } from 'react';
import { useStore } from '@nanostores/react';
import {
	forgejoService,
	formatSize,
	langColor,
	timeAgo,
} from './forgejoService';
import { useTabActive } from './forgejoUi';
import {
	Loader2,
	AlertTriangle,
	HardDrive,
	BookOpen,
	Users,
	Tag,
	Lock,
	Archive,
	Activity,
	GitBranch,
	Package,
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
	const storage = useStore(forgejoService.$storage);

	const { totalSize, top } = useMemo(() => {
		const sorted = [...repos].sort((a, b) => b.size - a.size);
		return {
			totalSize: sorted.reduce((s, r) => s + r.size, 0),
			top: sorted.slice(0, 8),
		};
	}, [repos]);

	const drift = useMemo(() => {
		if (!storage?.quota_enabled) return null;
		const quotaKb = (storage.repos_bytes + storage.lfs_bytes) / 1024;
		const repoSumKb = repos.reduce((s, r) => s + r.size, 0);
		const missingKb = quotaKb - repoSumKb;
		if (quotaKb <= 0 || missingKb <= 0) return null;
		const pct = (missingKb / quotaKb) * 100;
		if (pct < 5 || missingKb < 100 * 1024) return null;
		return { missingKb, pct };
	}, [repos, storage]);

	if (repos.length === 0) return null;

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
			{drift && (
				<div
					title="Per-repo sizes are summed from Forgejo's repository.size, which only updates on push or gc. The owner quota totals include LFS that some repos haven't recomputed yet — run a Forgejo size recalculation (admin → garbage collect repositories)."
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 6,
						padding: '0.5rem 0.7rem',
						borderRadius: 8,
						marginBottom: 8,
						background: 'rgba(234, 179, 8, 0.1)',
						border: '1px solid rgba(234, 179, 8, 0.3)',
						fontSize: '0.72rem',
						color: '#eab308',
					}}>
					<AlertTriangle size={14} />
					Stale repo sizes: ~{formatSize(drift.missingKb)} of LFS (
					{drift.pct.toFixed(0)}%) not yet reflected per-repo.
					Recompute Forgejo sizes.
				</div>
			)}
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

function RecentActivity() {
	const repos = useStore(forgejoService.$repos);
	if (repos.length === 0) return null;
	const recent = [...repos]
		.filter((r) => r.updated_at)
		.sort(
			(a, b) =>
				new Date(b.updated_at).getTime() -
				new Date(a.updated_at).getTime(),
		)
		.slice(0, 8);
	if (recent.length === 0) return null;
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
				<Activity size={12} />
				Recent Activity
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
				{recent.map((r) => (
					<div
						key={r.id}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 8,
							padding: '0.35rem 0.6rem',
							borderRadius: 6,
							background: 'var(--sl-color-bg, #0d1117)',
							fontSize: '0.78rem',
						}}>
						<GitBranch
							size={11}
							style={{
								color: 'var(--sl-color-gray-4, #6b7280)',
								flexShrink: 0,
							}}
						/>
						<span
							style={{
								color: 'var(--sl-color-white, #e6edf3)',
								fontWeight: 500,
								overflow: 'hidden',
								textOverflow: 'ellipsis',
								whiteSpace: 'nowrap',
								flex: 1,
							}}>
							{r.full_name}
						</span>
						{r.lfs_size > 0 && (
							<span
								style={{
									color: '#8b5cf6',
									fontSize: '0.65rem',
								}}>
								LFS {formatSize(r.lfs_size)}
							</span>
						)}
						<span
							style={{
								color: 'var(--sl-color-gray-4, #6b7280)',
								fontSize: '0.68rem',
								whiteSpace: 'nowrap',
							}}>
							{timeAgo(r.updated_at)}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

export default function ReactForgejoSummary() {
	const active = useTabActive('overview');
	const loading = useStore(forgejoService.$loading);
	const error = useStore(forgejoService.$error);
	const totalRepos = useStore(forgejoService.$totalRepos);
	const privateCount = useStore(forgejoService.$privateCount);
	const publicCount = useStore(forgejoService.$publicCount);
	const archivedCount = useStore(forgejoService.$archivedCount);
	const totalUsers = useStore(forgejoService.$totalUsers);
	const totalSize = useStore(forgejoService.$totalSize);
	const totalReleases = useStore(forgejoService.$totalReleases);
	const stats = useStore(forgejoService.$stats);
	const storage = useStore(forgejoService.$storage);

	if (!active) return null;

	const sizeValue = stats ? stats.total_size_kb : totalSize;
	const repoValue = stats ? stats.repo_count : totalRepos;
	const publicValue = stats ? stats.public : publicCount;
	const privateValue = stats ? stats.private : privateCount;
	const archivedValue = stats ? stats.archived : archivedCount;

	const usingQuota = !!storage?.quota_enabled;

	const gitKb = usingQuota
		? Math.round(storage!.repos_bytes / 1024)
		: (stats?.git_size_kb ?? 0);
	const lfsKb = usingQuota
		? Math.round(storage!.lfs_bytes / 1024)
		: (stats?.lfs_size_kb ?? 0);
	const contentKb = usingQuota ? gitKb + lfsKb : sizeValue;
	const contentSub =
		lfsKb > 0
			? `git ${formatSize(gitKb)} · LFS ${formatSize(lfsKb)}`
			: `across ${repoValue} repositories`;

	const nonRepoKb = usingQuota
		? Math.round(
				(storage!.artifacts_bytes +
					storage!.packages_bytes +
					storage!.attachments_bytes) /
					1024,
			)
		: 0;
	const nonRepoSub = usingQuota
		? [
				storage!.artifacts_bytes > 0 &&
					`CI ${formatSize(storage!.artifacts_bytes / 1024)}`,
				storage!.packages_bytes > 0 &&
					`pkg ${formatSize(storage!.packages_bytes / 1024)}`,
				storage!.attachments_bytes > 0 &&
					`attach ${formatSize(storage!.attachments_bytes / 1024)}`,
			]
				.filter(Boolean)
				.join(' · ')
		: '';

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
					label="Repository Storage"
					value={formatSize(contentKb)}
					color="#06b6d4"
					sub={contentSub}
				/>
				{usingQuota && nonRepoKb > 0 && (
					<StatCard
						icon={<Package size={12} />}
						label="CI & Packages"
						value={formatSize(nonRepoKb)}
						color="#f97316"
						sub={nonRepoSub}
					/>
				)}
				<StatCard
					icon={<BookOpen size={12} />}
					label="Repositories"
					value={repoValue}
					color="#22c55e"
					sub={`${publicValue} public · ${privateValue} private${archivedValue > 0 ? ` · ${archivedValue} archived` : ''}`}
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

			<RecentActivity />
		</div>
	);
}
