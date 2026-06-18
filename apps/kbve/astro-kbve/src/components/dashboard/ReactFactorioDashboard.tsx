import { useEffect, type ReactNode } from 'react';
import { useStore } from '@nanostores/react';
import {
	Factory,
	ShieldOff,
	Github,
	ExternalLink,
	Container,
	Server,
	Clock,
	Users,
	Gauge,
	Hash,
	Activity,
} from 'lucide-react';
import { homeService } from './homeService';
import {
	$current,
	$currentStatus,
	$playerEvents,
	$rotations,
	fetchAll,
	fetchCurrent,
	num,
	formatGameAge,
	isLive,
} from './factorioTelemetryService';

const IMAGE_NAME = 'ghcr.io/kbve/agones-factorio';
const FACTORIO_VERSION = '2.0.76';
const ISSUE_URL = 'https://github.com/KBVE/kbve/issues/12735';
const PROJECT_MDX = '/docs/project/agones-factorio/';

const styles = {
	centered: {
		display: 'flex',
		flexDirection: 'column' as const,
		alignItems: 'center',
		justifyContent: 'center',
		gap: '1rem',
		minHeight: '40vh',
		textAlign: 'center' as const,
	},
	heading: {
		margin: 0,
		fontSize: '1.75rem',
		color: 'var(--sl-color-text, #e6edf3)',
	},
	sub: {
		margin: 0,
		color: 'var(--sl-color-gray-3, #8b949e)',
		maxWidth: '40rem',
	},
	header: {
		display: 'flex',
		alignItems: 'center',
		gap: '0.75rem',
		marginBottom: '1rem',
	},
	statusRow: (live: boolean, error: boolean) => ({
		display: 'inline-flex',
		alignItems: 'center',
		gap: '0.5rem',
		padding: '0.35rem 0.75rem',
		borderRadius: '999px',
		fontSize: '0.85rem',
		fontWeight: 500,
		background: error
			? 'rgba(248, 81, 73, 0.15)'
			: live
				? 'rgba(63, 185, 80, 0.15)'
				: 'rgba(210, 153, 34, 0.15)',
		color: error
			? 'var(--sl-color-red, #f85149)'
			: live
				? 'var(--sl-color-green, #3fb950)'
				: 'var(--sl-color-orange, #d29922)',
		border: `1px solid ${error ? 'rgba(248, 81, 73, 0.4)' : live ? 'rgba(63, 185, 80, 0.4)' : 'rgba(210, 153, 34, 0.4)'}`,
	}),
	statusDot: (live: boolean, error: boolean) => ({
		width: '0.5rem',
		height: '0.5rem',
		borderRadius: '50%',
		background: error
			? 'var(--sl-color-red, #f85149)'
			: live
				? 'var(--sl-color-green, #3fb950)'
				: 'var(--sl-color-orange, #d29922)',
	}),
	grid: {
		display: 'grid',
		gap: '1rem',
		gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
		marginTop: '1.5rem',
	},
	card: {
		display: 'flex',
		flexDirection: 'column' as const,
		gap: '0.5rem',
		padding: '1rem 1.25rem',
		borderRadius: '0.75rem',
		border: '1px solid var(--sl-color-gray-5, #30363d)',
		background: 'var(--sl-color-bg-nav, rgba(13, 17, 23, 0.6))',
	},
	cardLabel: {
		display: 'flex',
		alignItems: 'center',
		gap: '0.5rem',
		fontSize: '0.85rem',
		color: 'var(--sl-color-gray-3, #8b949e)',
	},
	cardValue: {
		margin: 0,
		fontSize: '1rem',
		fontFamily: 'var(--sl-font-mono, ui-monospace, monospace)',
		color: 'var(--sl-color-text, #e6edf3)',
		wordBreak: 'break-all' as const,
	},
	panel: {
		marginTop: '2rem',
		padding: '1.25rem',
		borderRadius: '0.75rem',
		border: '1px solid var(--sl-color-gray-5, #30363d)',
		background: 'var(--sl-color-bg-nav, rgba(13, 17, 23, 0.6))',
	},
	list: {
		margin: '0.75rem 0 0',
		padding: 0,
		listStyle: 'none',
		display: 'flex',
		flexDirection: 'column' as const,
		gap: '0.4rem',
		color: 'var(--sl-color-gray-2, #c9d1d9)',
		fontSize: '0.85rem',
		fontFamily: 'var(--sl-font-mono, ui-monospace, monospace)',
	},
	links: {
		display: 'flex',
		gap: '0.75rem',
		flexWrap: 'wrap' as const,
		marginTop: '1.5rem',
	},
	linkButton: {
		display: 'inline-flex',
		alignItems: 'center',
		gap: '0.5rem',
		padding: '0.5rem 0.9rem',
		borderRadius: '0.5rem',
		border: '1px solid var(--sl-color-gray-5, #30363d)',
		background: 'var(--sl-color-bg-nav, rgba(13, 17, 23, 0.6))',
		color: 'var(--sl-color-text, #e6edf3)',
		textDecoration: 'none',
		fontSize: '0.9rem',
	},
};

function Card({
	icon,
	label,
	value,
}: {
	icon: ReactNode;
	label: string;
	value: string;
}) {
	return (
		<div style={styles.card}>
			<div style={styles.cardLabel}>
				{icon}
				{label}
			</div>
			<p style={styles.cardValue}>{value}</p>
		</div>
	);
}

export default function ReactFactorioDashboard() {
	const isStaff = useStore(homeService.$isStaff);
	const current = useStore($current);
	const currentStatus = useStore($currentStatus);
	const playerEvents = useStore($playerEvents);
	const rotations = useStore($rotations);

	useEffect(() => {
		if (!isStaff) return;
		fetchAll();
		const id = setInterval(() => fetchCurrent(), 10_000);
		return () => clearInterval(id);
	}, [isStaff]);

	if (!isStaff) {
		return (
			<div style={styles.centered}>
				<ShieldOff size={48} color="var(--sl-color-gray-3)" />
				<h2 style={styles.heading}>Staff Access Required</h2>
				<p style={styles.sub}>
					The Factorio control panel is restricted to KBVE staff.
				</p>
			</div>
		);
	}

	const row = current?.[0];
	const live = isLive(row);
	const error = currentStatus === 'error';
	const statusText = error
		? 'Telemetry error'
		: live
			? `Live · ${num(row?.players)} online`
			: currentStatus === 'loading'
				? 'Loading…'
				: 'No live data (server idle or not deployed)';

	return (
		<div>
			<div style={styles.header}>
				<Factory size={28} color="var(--sl-color-accent, #2f81f7)" />
				<h1 style={styles.heading}>Factorio</h1>
			</div>
			<span style={styles.statusRow(live, error)}>
				<span style={styles.statusDot(live, error)} />
				{statusText}
			</span>

			<div style={styles.grid}>
				<Card
					icon={<Users size={16} />}
					label="Players online"
					value={row ? String(num(row.players)) : '—'}
				/>
				<Card
					icon={<Gauge size={16} />}
					label="UPS"
					value={row ? num(row.ups).toFixed(1) : '—'}
				/>
				<Card
					icon={<Clock size={16} />}
					label="Map age (game)"
					value={row ? formatGameAge(num(row.map_age_game_s)) : '—'}
				/>
				<Card
					icon={<Hash size={16} />}
					label="Seed"
					value={row ? String(num(row.seed)) : '—'}
				/>
				<Card
					icon={<Activity size={16} />}
					label="Scenario"
					value={row?.scenario ?? '—'}
				/>
				<Card
					icon={<Server size={16} />}
					label="Server"
					value={row?.server_id ?? 'not deployed'}
				/>
				<Card
					icon={<Container size={16} />}
					label="Image"
					value={IMAGE_NAME}
				/>
				<Card
					icon={<Server size={16} />}
					label="Factorio version"
					value={FACTORIO_VERSION}
				/>
			</div>

			<div style={styles.panel}>
				<strong>Recent player events</strong>
				<ul style={styles.list}>
					{playerEvents && playerEvents.length > 0 ? (
						playerEvents.slice(0, 12).map((e, i) => (
							<li key={`${e.ts}-${i}`}>
								{e.ts} ·{' '}
								{e.event === 'join'
									? '→'
									: e.event === 'leave'
										? '←'
										: '×'}{' '}
								{e.player}
							</li>
						))
					) : (
						<li
							style={{
								color: 'var(--sl-color-gray-3, #8b949e)',
							}}>
							No events in the last 24h.
						</li>
					)}
				</ul>
			</div>

			<div style={styles.panel}>
				<strong>Map rotations</strong>
				<ul style={styles.list}>
					{rotations && rotations.length > 0 ? (
						rotations.slice(0, 10).map((r) => (
							<li key={r.rotation_id}>
								{r.started_at} · seed {num(r.seed)} ·{' '}
								{r.scenario} · peak {num(r.peak_players)} ·{' '}
								{r.end_reason}
							</li>
						))
					) : (
						<li
							style={{
								color: 'var(--sl-color-gray-3, #8b949e)',
							}}>
							No rotation history yet (relay writes lifecycle rows
							in a later phase).
						</li>
					)}
				</ul>
			</div>

			<div style={styles.links}>
				<a
					href={ISSUE_URL}
					target="_blank"
					rel="noopener"
					style={styles.linkButton}>
					<Github size={16} /> Tracking issue #12735
					<ExternalLink size={14} />
				</a>
				<a href={PROJECT_MDX} style={styles.linkButton}>
					<Container size={16} /> Project docs
					<ExternalLink size={14} />
				</a>
			</div>
		</div>
	);
}
