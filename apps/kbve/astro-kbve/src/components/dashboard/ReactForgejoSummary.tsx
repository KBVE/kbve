import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { forgejoService } from './forgejoService';
import { Loader2, AlertTriangle } from 'lucide-react';

function formatSize(kb: number): string {
	if (kb < 1024) return `${kb} KB`;
	const mb = kb / 1024;
	if (mb < 1024) return `${mb.toFixed(1)} MB`;
	return `${(mb / 1024).toFixed(2)} GB`;
}

function StatCard({
	label,
	value,
	color,
}: {
	label: string;
	value: string | number;
	color: string;
}) {
	return (
		<div
			style={{
				flex: '1 1 140px',
				padding: '1rem',
				borderRadius: 10,
				background: 'var(--sl-color-gray-6, #161b22)',
				border: '1px solid var(--sl-color-gray-5, #30363d)',
				textAlign: 'center',
			}}>
			<div
				style={{
					fontSize: '1.75rem',
					fontWeight: 700,
					color,
					lineHeight: 1.2,
				}}>
				{value}
			</div>
			<div
				style={{
					fontSize: '0.75rem',
					color: 'var(--sl-color-gray-3, #8b949e)',
					marginTop: 4,
				}}>
				{label}
			</div>
		</div>
	);
}

export default function ReactForgejoSummary() {
	const loading = useStore(forgejoService.$loading);
	const error = useStore(forgejoService.$error);
	const totalRepos = useStore(forgejoService.$totalRepos);
	const privateCount = useStore(forgejoService.$privateCount);
	const mirrorCount = useStore(forgejoService.$mirrorCount);
	const totalUsers = useStore(forgejoService.$totalUsers);
	const totalSize = useStore(forgejoService.$totalSize);

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
			<div
				style={{
					display: 'flex',
					gap: '0.75rem',
					flexWrap: 'wrap',
					marginBottom: '1.5rem',
				}}>
				<StatCard
					label="Repositories"
					value={totalRepos}
					color="#06b6d4"
				/>
				<StatCard
					label="Private"
					value={privateCount}
					color="#f59e0b"
				/>
				<StatCard label="Mirrors" value={mirrorCount} color="#8b5cf6" />
				<StatCard label="Users" value={totalUsers} color="#22c55e" />
				<StatCard
					label="Total Size"
					value={formatSize(totalSize)}
					color="#06b6d4"
				/>
			</div>
		</div>
	);
}
