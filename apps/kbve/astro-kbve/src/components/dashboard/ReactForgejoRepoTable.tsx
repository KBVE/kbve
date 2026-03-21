import { useStore } from '@nanostores/react';
import { forgejoService, type ForgejoRepo } from './forgejoService';
import { Lock, GitFork, Star, AlertCircle, Copy } from 'lucide-react';

function timeAgo(dateStr: string): string {
	const diff = Date.now() - new Date(dateStr).getTime();
	const mins = Math.floor(diff / 60000);
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	const days = Math.floor(hrs / 24);
	if (days < 30) return `${days}d ago`;
	return `${Math.floor(days / 30)}mo ago`;
}

function RepoRow({ repo }: { repo: ForgejoRepo }) {
	return (
		<tr
			style={{
				borderBottom: '1px solid var(--sl-color-gray-5, #30363d)',
			}}>
			<td style={{ padding: '0.6rem 0.75rem' }}>
				<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
							size={12}
							style={{ color: '#f59e0b', flexShrink: 0 }}
						/>
					)}
					{repo.mirror && (
						<Copy
							size={12}
							style={{ color: '#8b5cf6', flexShrink: 0 }}
						/>
					)}
					{repo.fork && (
						<GitFork
							size={12}
							style={{ color: '#6b7280', flexShrink: 0 }}
						/>
					)}
				</div>
				{repo.description && (
					<div
						style={{
							color: 'var(--sl-color-gray-3, #8b949e)',
							fontSize: '0.75rem',
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
					textAlign: 'center',
				}}>
				<span
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: 3,
						color: '#f59e0b',
						fontSize: '0.8rem',
					}}>
					<Star size={12} />
					{repo.stars_count}
				</span>
			</td>
			<td
				style={{
					padding: '0.6rem 0.75rem',
					textAlign: 'center',
				}}>
				{repo.open_issues_count > 0 && (
					<span
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 3,
							color: '#22c55e',
							fontSize: '0.8rem',
						}}>
						<AlertCircle size={12} />
						{repo.open_issues_count}
					</span>
				)}
			</td>
			<td
				style={{
					padding: '0.6rem 0.75rem',
					color: 'var(--sl-color-gray-3, #8b949e)',
					fontSize: '0.75rem',
					whiteSpace: 'nowrap',
				}}>
				{timeAgo(repo.updated_at)}
			</td>
		</tr>
	);
}

export default function ReactForgejoRepoTable() {
	const repos = useStore(forgejoService.$repos);

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
									padding: '0.6rem 0.75rem',
									textAlign: 'left',
									color: 'var(--sl-color-gray-3, #8b949e)',
									fontWeight: 600,
									fontSize: '0.75rem',
									textTransform: 'uppercase',
									letterSpacing: '0.05em',
								}}>
								Repository
							</th>
							<th
								style={{
									padding: '0.6rem 0.75rem',
									textAlign: 'left',
									color: 'var(--sl-color-gray-3, #8b949e)',
									fontWeight: 600,
									fontSize: '0.75rem',
									textTransform: 'uppercase',
									letterSpacing: '0.05em',
								}}>
								Branch
							</th>
							<th
								style={{
									padding: '0.6rem 0.75rem',
									textAlign: 'center',
									color: 'var(--sl-color-gray-3, #8b949e)',
									fontWeight: 600,
									fontSize: '0.75rem',
									textTransform: 'uppercase',
									letterSpacing: '0.05em',
								}}>
								Stars
							</th>
							<th
								style={{
									padding: '0.6rem 0.75rem',
									textAlign: 'center',
									color: 'var(--sl-color-gray-3, #8b949e)',
									fontWeight: 600,
									fontSize: '0.75rem',
									textTransform: 'uppercase',
									letterSpacing: '0.05em',
								}}>
								Issues
							</th>
							<th
								style={{
									padding: '0.6rem 0.75rem',
									textAlign: 'left',
									color: 'var(--sl-color-gray-3, #8b949e)',
									fontWeight: 600,
									fontSize: '0.75rem',
									textTransform: 'uppercase',
									letterSpacing: '0.05em',
								}}>
								Updated
							</th>
						</tr>
					</thead>
					<tbody>
						{repos.map((repo) => (
							<RepoRow key={repo.id} repo={repo} />
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
