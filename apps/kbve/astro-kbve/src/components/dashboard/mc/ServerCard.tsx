import { useEffect, useState } from 'react';
import { Network, Server, Users } from 'lucide-react';
import RconConsole, { type McServer } from './RconConsole';

interface McPlayer {
	name: string;
	uuid: string | null;
	skin_url: string | null;
	server: string;
}

interface McServerStatus {
	server: string;
	online: number;
	max: number;
	reachable: boolean;
}

interface McPlayerListData {
	online: number;
	max: number;
	players: McPlayer[];
	servers: McServerStatus[];
	cached_at: number;
}

interface Props {
	server: McServer;
	label: string;
	role: string;
	refreshInterval?: number;
}

const styles = {
	card: {
		display: 'flex',
		flexDirection: 'column' as const,
		gap: '1rem',
		padding: '1.25rem',
		borderRadius: '0.75rem',
		border: '1px solid var(--sl-color-gray-5, #30363d)',
		background: 'var(--sl-color-bg-nav, rgba(13, 17, 23, 0.6))',
	},
	header: {
		display: 'flex',
		justifyContent: 'space-between',
		alignItems: 'flex-start',
		gap: '0.75rem',
	},
	titleBlock: {
		display: 'flex',
		flexDirection: 'column' as const,
		gap: '0.25rem',
	},
	title: {
		display: 'flex',
		alignItems: 'center',
		gap: '0.5rem',
		margin: 0,
		fontSize: '1.1rem',
		fontWeight: 700,
		color: 'var(--sl-color-text, #e6edf3)',
	},
	role: {
		margin: 0,
		fontSize: '0.78rem',
		color: 'var(--sl-color-gray-3, #8b949e)',
	},
	statusPill: (reachable: boolean): React.CSSProperties => ({
		display: 'inline-flex',
		alignItems: 'center',
		gap: '0.35rem',
		padding: '0.25rem 0.6rem',
		borderRadius: '999px',
		fontSize: '0.72rem',
		fontWeight: 600,
		background: reachable
			? 'rgba(63, 185, 80, 0.15)'
			: 'rgba(248, 81, 73, 0.15)',
		color: reachable
			? 'var(--sl-color-green, #3fb950)'
			: 'var(--sl-color-red, #f85149)',
		border: `1px solid ${
			reachable ? 'rgba(63, 185, 80, 0.4)' : 'rgba(248, 81, 73, 0.4)'
		}`,
	}),
	statusDot: (reachable: boolean): React.CSSProperties => ({
		width: '0.45rem',
		height: '0.45rem',
		borderRadius: '50%',
		background: reachable
			? 'var(--sl-color-green, #3fb950)'
			: 'var(--sl-color-red, #f85149)',
	}),
	metricsRow: {
		display: 'flex',
		gap: '0.75rem',
		flexWrap: 'wrap' as const,
	},
	metric: {
		flex: '1 1 8rem',
		display: 'flex',
		flexDirection: 'column' as const,
		gap: '0.15rem',
		padding: '0.6rem 0.75rem',
		borderRadius: '0.5rem',
		background: 'rgba(13, 17, 23, 0.4)',
		border: '1px solid var(--sl-color-gray-5, #30363d)',
	},
	metricLabel: {
		display: 'flex',
		alignItems: 'center',
		gap: '0.35rem',
		fontSize: '0.7rem',
		fontWeight: 600,
		letterSpacing: '0.04em',
		textTransform: 'uppercase' as const,
		color: 'var(--sl-color-gray-3, #8b949e)',
	},
	metricValue: {
		fontSize: '1.1rem',
		fontWeight: 700,
		color: 'var(--sl-color-text, #e6edf3)',
	},
	players: {
		display: 'flex',
		flexWrap: 'wrap' as const,
		gap: '0.35rem',
	},
	playerChip: {
		display: 'inline-flex',
		alignItems: 'center',
		gap: '0.3rem',
		padding: '0.2rem 0.55rem',
		borderRadius: '999px',
		fontSize: '0.75rem',
		background: 'rgba(47, 129, 247, 0.1)',
		color: 'var(--sl-color-accent, #2f81f7)',
		border: '1px solid rgba(47, 129, 247, 0.3)',
	},
	playersEmpty: {
		margin: 0,
		fontSize: '0.78rem',
		fontStyle: 'italic' as const,
		color: 'var(--sl-color-gray-3, #8b949e)',
	},
};

export default function ServerCard({
	server,
	label,
	role,
	refreshInterval = 15_000,
}: Props) {
	const [data, setData] = useState<McPlayerListData | null>(null);

	useEffect(() => {
		let cancelled = false;
		async function poll() {
			try {
				const res = await fetch('/api/v1/mc/players');
				if (!res.ok) return;
				const json = (await res.json()) as McPlayerListData;
				if (!cancelled) setData(json);
			} catch {
				/* ignore — keep last known good */
			}
		}
		poll();
		const id = window.setInterval(poll, refreshInterval);
		return () => {
			cancelled = true;
			window.clearInterval(id);
		};
	}, [refreshInterval]);

	const status = data?.servers.find((s) => s.server === server);
	const players = (data?.players ?? []).filter((p) => p.server === server);
	const reachable = status?.reachable ?? false;

	const showsPlayers = server !== 'velocity';

	return (
		<div style={styles.card}>
			<div style={styles.header}>
				<div style={styles.titleBlock}>
					<h3 style={styles.title}>
						<Server size={18} /> {label}
					</h3>
					<p style={styles.role}>{role}</p>
				</div>
				<span style={styles.statusPill(reachable)}>
					<span style={styles.statusDot(reachable)} />
					{reachable ? 'online' : 'unreachable'}
				</span>
			</div>

			<div style={styles.metricsRow}>
				<div style={styles.metric}>
					<span style={styles.metricLabel}>
						<Users size={12} /> Online
					</span>
					<span style={styles.metricValue}>
						{status ? `${status.online} / ${status.max}` : '—'}
					</span>
				</div>
				<div style={styles.metric}>
					<span style={styles.metricLabel}>
						<Network size={12} /> Endpoint
					</span>
					<span
						style={{
							...styles.metricValue,
							fontSize: '0.85rem',
							fontFamily: 'var(--sl-font-mono, monospace)',
						}}>
						RCON_MC_{server.toUpperCase()}
					</span>
				</div>
			</div>

			{showsPlayers && (
				<div>
					<div
						style={{
							...styles.metricLabel,
							marginBottom: '0.35rem',
						}}>
						<Users size={12} /> Players ({players.length})
					</div>
					{players.length === 0 ? (
						<p style={styles.playersEmpty}>No players online.</p>
					) : (
						<div style={styles.players}>
							{players.map((p) => (
								<span
									key={p.uuid ?? p.name}
									style={styles.playerChip}>
									{p.name}
								</span>
							))}
						</div>
					)}
				</div>
			)}

			<RconConsole server={server} />
		</div>
	);
}
