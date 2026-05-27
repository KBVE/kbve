import { useStore } from '@nanostores/react';
import {
	ShieldOff,
	Gamepad2,
	Factory,
	Pickaxe,
	ArrowRight,
} from 'lucide-react';
import { homeService } from './homeService';

type TileStatus = 'live' | 'phase-0' | 'planned';

interface Tile {
	key: string;
	label: string;
	description: string;
	href: string;
	icon: React.ComponentType<{ size?: number; color?: string }>;
	status: TileStatus;
	statusNote: string;
}

const TILES: Tile[] = [
	{
		key: 'rows',
		label: 'ROWS — ChuckRPG',
		description:
			'Agones fleet for the ChuckRPG MMO. Live RCON-equivalent control plane, fleet status, telemetry.',
		href: '/dashboard/gameops/rows/',
		icon: Gamepad2,
		status: 'live',
		statusNote: 'Live · Agones fleet + telemetry',
	},
	{
		key: 'factorio',
		label: 'Factorio',
		description:
			'KBVE-baked Factorio dedicated server. Image landed; GameServer manifests + factorio-ctl backend land in later phases.',
		href: '/dashboard/gameops/factorio/',
		icon: Factory,
		status: 'phase-0',
		statusNote: 'Phase 0 · Image published, no live data yet',
	},
	{
		key: 'mc',
		label: 'Minecraft',
		description:
			'Velocity proxy + Paper backends already deployed under apps/kube/agones/mc/. Live dashboard wiring still TBD.',
		href: '/dashboard/gameops/mc/',
		icon: Pickaxe,
		status: 'planned',
		statusNote: 'Planned · Deployed in cluster, not yet wired to dashboard',
	},
];

const statusColors: Record<TileStatus, string> = {
	live: 'var(--sl-color-green, #3fb950)',
	'phase-0': 'var(--sl-color-orange, #d29922)',
	planned: 'var(--sl-color-gray-3, #8b949e)',
};

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
		flexDirection: 'column' as const,
		gap: '0.5rem',
		marginBottom: '1.5rem',
	},
	grid: {
		display: 'grid',
		gap: '1rem',
		gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
	},
	tile: {
		display: 'flex',
		flexDirection: 'column' as const,
		gap: '0.75rem',
		padding: '1.25rem',
		borderRadius: '0.75rem',
		border: '1px solid var(--sl-color-gray-5, #30363d)',
		background: 'var(--sl-color-bg-nav, rgba(13, 17, 23, 0.6))',
		color: 'var(--sl-color-text, #e6edf3)',
		textDecoration: 'none',
		transition: 'border-color 0.15s ease, transform 0.15s ease',
		minHeight: '12rem',
	},
	tileRow: {
		display: 'flex',
		alignItems: 'center',
		gap: '0.75rem',
	},
	tileTitle: {
		margin: 0,
		fontSize: '1.1rem',
		fontWeight: 600,
	},
	tileDesc: {
		margin: 0,
		flex: 1,
		fontSize: '0.9rem',
		color: 'var(--sl-color-gray-2, #c9d1d9)',
	},
	statusBadge: {
		display: 'inline-flex',
		alignItems: 'center',
		gap: '0.4rem',
		fontSize: '0.8rem',
		fontWeight: 500,
	},
	statusDot: {
		width: '0.5rem',
		height: '0.5rem',
		borderRadius: '50%',
		display: 'inline-block',
	},
	tileFooter: {
		display: 'flex',
		justifyContent: 'space-between',
		alignItems: 'center',
		fontSize: '0.85rem',
		color: 'var(--sl-color-gray-3, #8b949e)',
	},
};

export default function ReactGameOpsPanel() {
	const isStaff = useStore(homeService.$isStaff);

	if (!isStaff) {
		return (
			<div style={styles.centered}>
				<ShieldOff size={48} color="var(--sl-color-gray-3)" />
				<h2 style={styles.heading}>Staff Access Required</h2>
				<p style={styles.sub}>
					GameOps is restricted to KBVE staff. Sign in with a staff
					account, or contact an administrator if you believe this is
					an error.
				</p>
			</div>
		);
	}

	return (
		<>
			<header style={styles.header}>
				<h1 style={styles.heading}>GameOps</h1>
				<p style={styles.sub}>
					Central console for the KBVE game-server fleet. Each tile is
					a live or planned control plane for one Agones-managed
					title.
				</p>
			</header>

			<div style={styles.grid} role="list">
				{TILES.map((tile) => {
					const Icon = tile.icon;
					return (
						<a
							key={tile.key}
							href={tile.href}
							role="listitem"
							style={styles.tile}>
							<div style={styles.tileRow}>
								<Icon
									size={24}
									color="var(--sl-color-accent, #2f81f7)"
								/>
								<h3 style={styles.tileTitle}>{tile.label}</h3>
							</div>
							<p style={styles.tileDesc}>{tile.description}</p>
							<div style={styles.tileFooter}>
								<span style={styles.statusBadge}>
									<span
										style={{
											...styles.statusDot,
											background:
												statusColors[tile.status],
										}}
									/>
									{tile.statusNote}
								</span>
								<ArrowRight size={16} />
							</div>
						</a>
					);
				})}
			</div>
		</>
	);
}
