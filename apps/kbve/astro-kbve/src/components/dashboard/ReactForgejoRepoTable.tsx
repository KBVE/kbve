import { useStore } from '@nanostores/react';
import {
	forgejoService,
	formatSize,
	timeAgo,
	langColor,
	type ForgejoRepo,
	type RepoDetail,
} from './forgejoService';
import {
	Lock,
	GitFork,
	Copy,
	ChevronDown,
	ChevronRight,
	GitBranch,
	GitCommit,
	Tag,
	Download,
	Shield,
	Archive,
	Loader2,
	HardDrive,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const sectionHeader: React.CSSProperties = {
	display: 'flex',
	alignItems: 'center',
	gap: 4,
	fontSize: '0.7rem',
	fontWeight: 600,
	color: 'var(--sl-color-gray-3, #8b949e)',
	textTransform: 'uppercase',
	letterSpacing: '0.05em',
	marginBottom: 6,
};

function pillStyle(color: string): React.CSSProperties {
	return {
		display: 'inline-flex',
		padding: '1px 6px',
		borderRadius: 4,
		fontSize: '0.6rem',
		fontWeight: 600,
		background: `${color}18`,
		border: `1px solid ${color}30`,
		color,
		textTransform: 'uppercase',
		letterSpacing: '0.05em',
	};
}

const thStyle: React.CSSProperties = {
	padding: '0.6rem 0.75rem',
	textAlign: 'left',
	color: 'var(--sl-color-gray-3, #8b949e)',
	fontWeight: 600,
	fontSize: '0.75rem',
	textTransform: 'uppercase',
	letterSpacing: '0.05em',
};

// ---------------------------------------------------------------------------
// Repo detail expansion panel
// ---------------------------------------------------------------------------

function LanguageBreakdown({
	languages,
}: {
	languages: Record<string, number>;
}) {
	const entries = Object.entries(languages).sort((a, b) => b[1] - a[1]);
	if (entries.length === 0) return null;

	const total = entries.reduce((s, [, v]) => s + v, 0);

	return (
		<div>
			<div style={sectionHeader}>Languages</div>
			<div
				style={{
					display: 'flex',
					height: 6,
					borderRadius: 3,
					overflow: 'hidden',
					background: 'var(--sl-color-gray-5, #30363d)',
					marginBottom: 6,
				}}>
				{entries.map(([lang, bytes]) => (
					<div
						key={lang}
						title={`${lang}: ${((bytes / total) * 100).toFixed(1)}%`}
						style={{
							width: `${(bytes / total) * 100}%`,
							background: langColor(lang),
							minWidth: 2,
						}}
					/>
				))}
			</div>
			<div
				style={{
					display: 'flex',
					flexWrap: 'wrap',
					gap: '0.4rem 0.8rem',
				}}>
				{entries.slice(0, 8).map(([lang, bytes]) => (
					<span
						key={lang}
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 4,
							fontSize: '0.7rem',
							color: 'var(--sl-color-gray-3, #8b949e)',
						}}>
						<span
							style={{
								width: 7,
								height: 7,
								borderRadius: '50%',
								background: langColor(lang),
							}}
						/>
						{lang}{' '}
						<span style={{ opacity: 0.6 }}>
							{((bytes / total) * 100).toFixed(1)}%
						</span>
					</span>
				))}
			</div>
		</div>
	);
}

function BranchList({ detail }: { detail: RepoDetail }) {
	if (detail.branches.length === 0) return null;
	return (
		<div>
			<div style={sectionHeader}>
				<GitBranch size={12} /> Branches ({detail.branches.length})
			</div>
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
				{detail.branches.map((b) => (
					<span
						key={b.name}
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 4,
							padding: '2px 8px',
							borderRadius: 6,
							background: b.protected
								? 'rgba(34, 197, 94, 0.1)'
								: 'var(--sl-color-gray-5, #21262d)',
							border: b.protected
								? '1px solid rgba(34, 197, 94, 0.3)'
								: '1px solid var(--sl-color-gray-5, #30363d)',
							fontSize: '0.7rem',
							color: 'var(--sl-color-text, #e6edf3)',
						}}>
						{b.protected && (
							<Shield size={10} style={{ color: '#22c55e' }} />
						)}
						{b.name}
					</span>
				))}
			</div>
		</div>
	);
}

function CommitList({ detail }: { detail: RepoDetail }) {
	if (detail.commits.length === 0) return null;
	return (
		<div>
			<div style={sectionHeader}>
				<GitCommit size={12} /> Recent Commits
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
				{detail.commits.slice(0, 5).map((c) => (
					<div
						key={c.sha}
						style={{
							display: 'flex',
							gap: 8,
							alignItems: 'baseline',
							fontSize: '0.75rem',
						}}>
						<code
							style={{
								color: '#06b6d4',
								fontFamily: 'monospace',
								fontSize: '0.7rem',
								flexShrink: 0,
							}}>
							{c.sha.slice(0, 7)}
						</code>
						<span
							style={{
								color: 'var(--sl-color-text, #e6edf3)',
								overflow: 'hidden',
								textOverflow: 'ellipsis',
								whiteSpace: 'nowrap',
								flex: 1,
							}}>
							{c.commit.message.split('\n')[0]}
						</span>
						<span
							style={{
								color: 'var(--sl-color-gray-3, #8b949e)',
								fontSize: '0.65rem',
								flexShrink: 0,
							}}>
							{timeAgo(c.commit.author.date)}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

function ReleaseList({ detail }: { detail: RepoDetail }) {
	if (detail.releases.length === 0) return null;

	const totalAssetSize = detail.releases
		.flatMap((r) => r.assets)
		.reduce((s, a) => s + a.size, 0);
	const totalDownloads = detail.releases
		.flatMap((r) => r.assets)
		.reduce((s, a) => s + a.download_count, 0);
	const totalAssets = detail.releases.flatMap((r) => r.assets).length;

	return (
		<div>
			<div style={sectionHeader}>
				<Tag size={12} /> Releases ({detail.releases.length})
				{totalAssets > 0 && (
					<span
						style={{
							marginLeft: 8,
							fontSize: '0.65rem',
							color: 'var(--sl-color-gray-3, #8b949e)',
							fontWeight: 400,
						}}>
						{totalAssets} assets ·{' '}
						<HardDrive
							size={10}
							style={{ verticalAlign: 'middle' }}
						/>{' '}
						{formatSize(Math.round(totalAssetSize / 1024))}
						{totalDownloads > 0 && (
							<>
								{' · '}
								<Download
									size={10}
									style={{ verticalAlign: 'middle' }}
								/>{' '}
								{totalDownloads}
							</>
						)}
					</span>
				)}
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
				{detail.releases.slice(0, 5).map((r) => (
					<div
						key={r.id}
						style={{
							padding: '0.5rem 0.75rem',
							borderRadius: 8,
							background: 'var(--sl-color-gray-6, #161b22)',
							border: '1px solid var(--sl-color-gray-5, #30363d)',
						}}>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 6,
								marginBottom: r.assets.length > 0 ? 4 : 0,
							}}>
							<span
								style={{
									color: 'var(--sl-color-text, #e6edf3)',
									fontWeight: 600,
									fontSize: '0.8rem',
								}}>
								{r.tag_name}
							</span>
							{r.name && r.name !== r.tag_name && (
								<span
									style={{
										color: 'var(--sl-color-gray-3, #8b949e)',
										fontSize: '0.75rem',
									}}>
									{r.name}
								</span>
							)}
							{r.prerelease && (
								<span style={pillStyle('#f59e0b')}>
									pre-release
								</span>
							)}
							{r.draft && (
								<span style={pillStyle('#6b7280')}>draft</span>
							)}
							<span
								style={{
									marginLeft: 'auto',
									color: 'var(--sl-color-gray-3, #8b949e)',
									fontSize: '0.65rem',
								}}>
								{timeAgo(r.published_at || r.created_at)}
							</span>
						</div>
						{r.assets.length > 0 && (
							<div
								style={{
									display: 'flex',
									flexWrap: 'wrap',
									gap: 4,
								}}>
								{r.assets.map((a) => (
									<span
										key={a.id}
										style={{
											display: 'inline-flex',
											alignItems: 'center',
											gap: 4,
											padding: '2px 6px',
											borderRadius: 4,
											background:
												'var(--sl-color-gray-5, #21262d)',
											fontSize: '0.65rem',
											color: 'var(--sl-color-gray-3, #8b949e)',
										}}>
										<Download size={9} />
										{a.name}
										<span style={{ opacity: 0.6 }}>
											{formatSize(
												Math.round(a.size / 1024),
											)}
										</span>
										{a.download_count > 0 && (
											<span style={{ color: '#06b6d4' }}>
												({a.download_count})
											</span>
										)}
									</span>
								))}
							</div>
						)}
					</div>
				))}
			</div>
		</div>
	);
}

function RepoDetailPanel({ detail }: { detail: RepoDetail }) {
	if (detail.loading) {
		return (
			<div
				style={{
					display: 'flex',
					justifyContent: 'center',
					padding: '1.5rem',
				}}>
				<Loader2
					size={20}
					style={{
						animation: 'spin 1s linear infinite',
						color: 'var(--sl-color-accent, #06b6d4)',
					}}
				/>
			</div>
		);
	}

	return (
		<div
			style={{
				padding: '1rem 1.25rem',
				background: 'var(--sl-color-bg-nav, #111)',
				borderTop: '1px solid var(--sl-color-gray-5, #30363d)',
				display: 'flex',
				flexDirection: 'column',
				gap: '1rem',
			}}>
			<LanguageBreakdown languages={detail.languages} />
			<BranchList detail={detail} />
			<CommitList detail={detail} />
			<ReleaseList detail={detail} />
		</div>
	);
}

// ---------------------------------------------------------------------------
// Row component
// ---------------------------------------------------------------------------

function RepoRow({
	repo,
	expanded,
	detail,
}: {
	repo: ForgejoRepo;
	expanded: boolean;
	detail?: RepoDetail;
}) {
	return (
		<>
			<tr
				onClick={() =>
					forgejoService.toggleExpandedRepo(repo.full_name)
				}
				style={{
					borderBottom: expanded
						? 'none'
						: '1px solid var(--sl-color-gray-5, #30363d)',
					cursor: 'pointer',
					background: expanded
						? 'var(--sl-color-gray-6, #161b22)'
						: 'transparent',
					transition: 'background 0.15s',
				}}>
				<td style={{ padding: '0.6rem 0.5rem', width: 24 }}>
					{expanded ? (
						<ChevronDown
							size={14}
							style={{
								color: 'var(--sl-color-gray-3, #8b949e)',
							}}
						/>
					) : (
						<ChevronRight
							size={14}
							style={{
								color: 'var(--sl-color-gray-3, #8b949e)',
							}}
						/>
					)}
				</td>
				<td style={{ padding: '0.6rem 0.75rem' }}>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 6,
						}}>
						{repo.language && (
							<span
								style={{
									width: 8,
									height: 8,
									borderRadius: '50%',
									background: langColor(repo.language),
									flexShrink: 0,
								}}
							/>
						)}
						<span
							style={{
								color: 'var(--sl-color-text, #e6edf3)',
								fontWeight: 500,
								fontSize: '0.85rem',
							}}>
							{repo.full_name}
						</span>
						{repo.private && (
							<Lock
								size={11}
								style={{ color: '#f59e0b', flexShrink: 0 }}
							/>
						)}
						{repo.mirror && (
							<Copy
								size={11}
								style={{ color: '#8b5cf6', flexShrink: 0 }}
							/>
						)}
						{repo.fork && (
							<GitFork
								size={11}
								style={{ color: '#6b7280', flexShrink: 0 }}
							/>
						)}
						{repo.archived && (
							<Archive
								size={11}
								style={{ color: '#6b7280', flexShrink: 0 }}
							/>
						)}
					</div>
					{repo.description && (
						<div
							style={{
								color: 'var(--sl-color-gray-3, #8b949e)',
								fontSize: '0.72rem',
								marginTop: 2,
								maxWidth: 400,
								overflow: 'hidden',
								textOverflow: 'ellipsis',
								whiteSpace: 'nowrap',
							}}>
							{repo.description}
						</div>
					)}
				</td>
				<td
					style={{
						padding: '0.6rem 0.75rem',
						color: 'var(--sl-color-gray-3, #8b949e)',
						fontSize: '0.8rem',
					}}>
					{repo.default_branch}
				</td>
				<td
					style={{
						padding: '0.6rem 0.75rem',
						textAlign: 'right',
						fontFamily: 'monospace',
						fontSize: '0.8rem',
						color:
							repo.size > 100 * 1024
								? '#f59e0b'
								: repo.size > 10 * 1024
									? '#06b6d4'
									: 'var(--sl-color-gray-3, #8b949e)',
						fontWeight: repo.size > 100 * 1024 ? 600 : 400,
					}}>
					{formatSize(repo.size)}
				</td>
				<td
					style={{
						padding: '0.6rem 0.75rem',
						textAlign: 'center',
						color: 'var(--sl-color-gray-3, #8b949e)',
						fontSize: '0.75rem',
					}}>
					{(repo.release_counter ?? 0) > 0 && (
						<span
							style={{
								display: 'inline-flex',
								alignItems: 'center',
								gap: 3,
								color: '#8b5cf6',
							}}>
							<Tag size={11} />
							{repo.release_counter}
						</span>
					)}
				</td>
				<td
					style={{
						padding: '0.6rem 0.75rem',
						color: 'var(--sl-color-gray-3, #8b949e)',
						fontSize: '0.72rem',
						whiteSpace: 'nowrap',
					}}>
					{timeAgo(repo.updated_at)}
				</td>
			</tr>
			{expanded && detail && (
				<tr>
					<td colSpan={6} style={{ padding: 0 }}>
						<RepoDetailPanel detail={detail} />
					</td>
				</tr>
			)}
		</>
	);
}

// ---------------------------------------------------------------------------
// Main table
// ---------------------------------------------------------------------------

export default function ReactForgejoRepoTable() {
	const repos = useStore(forgejoService.$repos);
	const expandedRepo = useStore(forgejoService.$expandedRepo);
	const repoDetails = useStore(forgejoService.$repoDetails);

	if (repos.length === 0) return null;

	return (
		<div className="not-content">
			<div
				style={{
					borderRadius: 10,
					border: '1px solid var(--sl-color-gray-5, #30363d)',
					overflow: 'hidden',
				}}>
				<table
					style={{
						width: '100%',
						borderCollapse: 'collapse',
						fontSize: '0.85rem',
					}}>
					<thead>
						<tr
							style={{
								background: 'var(--sl-color-gray-6, #161b22)',
								borderBottom:
									'1px solid var(--sl-color-gray-5, #30363d)',
							}}>
							<th
								style={{
									...thStyle,
									width: 24,
									padding: '0.6rem 0.5rem',
								}}
							/>
							<th style={thStyle}>Repository</th>
							<th style={thStyle}>Branch</th>
							<th style={{ ...thStyle, textAlign: 'right' }}>
								Size
							</th>
							<th style={{ ...thStyle, textAlign: 'center' }}>
								Releases
							</th>
							<th style={thStyle}>Updated</th>
						</tr>
					</thead>
					<tbody>
						{repos.map((repo) => (
							<RepoRow
								key={repo.id}
								repo={repo}
								expanded={expandedRepo === repo.full_name}
								detail={repoDetails[repo.full_name]}
							/>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
