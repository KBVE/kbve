import { useStore } from '@nanostores/react';
import {
	Pickaxe,
	ShieldOff,
	Github,
	ExternalLink,
	Container,
	Server,
	Boxes,
} from 'lucide-react';
import { homeService } from './homeService';

const VELOCITY_IMAGE = 'ghcr.io/kbve/mc-velocity';
const LOBBY_IMAGE = 'ghcr.io/kbve/mc-lobby';
const MANIFESTS_PATH = '/docs/project/mc-velocity/';
const REPO_PATH = 'https://github.com/KBVE/kbve/tree/main/apps/kube/agones/mc';

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
	statusRow: {
		display: 'inline-flex',
		alignItems: 'center',
		gap: '0.5rem',
		padding: '0.35rem 0.75rem',
		borderRadius: '999px',
		fontSize: '0.85rem',
		fontWeight: 500,
		background: 'rgba(139, 148, 158, 0.15)',
		color: 'var(--sl-color-gray-3, #8b949e)',
		border: '1px solid rgba(139, 148, 158, 0.4)',
	},
	statusDot: {
		width: '0.5rem',
		height: '0.5rem',
		borderRadius: '50%',
		background: 'var(--sl-color-gray-3, #8b949e)',
	},
	grid: {
		display: 'grid',
		gap: '1rem',
		gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
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

export default function ReactMcDashboard() {
	const isStaff = useStore(homeService.$isStaff);

	if (!isStaff) {
		return (
			<div style={styles.centered}>
				<ShieldOff size={48} color="var(--sl-color-gray-3)" />
				<h2 style={styles.heading}>Staff Access Required</h2>
				<p style={styles.sub}>
					The Minecraft control panel is restricted to KBVE staff.
				</p>
			</div>
		);
	}

	return (
		<div>
			<div style={styles.header}>
				<Pickaxe size={28} color="var(--sl-color-accent, #2f81f7)" />
				<h1 style={styles.heading}>Minecraft</h1>
			</div>
			<span style={styles.statusRow}>
				<span style={styles.statusDot} />
				Deployed in cluster · Live dashboard wiring planned
			</span>

			<div style={styles.grid}>
				<div style={styles.card}>
					<div style={styles.cardLabel}>
						<Container size={16} />
						Velocity proxy image
					</div>
					<p style={styles.cardValue}>{VELOCITY_IMAGE}</p>
				</div>
				<div style={styles.card}>
					<div style={styles.cardLabel}>
						<Container size={16} />
						Lobby image
					</div>
					<p style={styles.cardValue}>{LOBBY_IMAGE}</p>
				</div>
				<div style={styles.card}>
					<div style={styles.cardLabel}>
						<Server size={16} />
						Cluster manifests
					</div>
					<p style={styles.cardValue}>apps/kube/agones/mc/</p>
				</div>
				<div style={styles.card}>
					<div style={styles.cardLabel}>
						<Boxes size={16} />
						Live RCON / player count
					</div>
					<p style={styles.cardValue}>
						not yet wired into this dashboard
					</p>
				</div>
			</div>

			<div style={styles.links}>
				<a
					href={REPO_PATH}
					target="_blank"
					rel="noopener"
					style={styles.linkButton}>
					<Github size={16} /> Manifests on GitHub
					<ExternalLink size={14} />
				</a>
				<a href={MANIFESTS_PATH} style={styles.linkButton}>
					<Container size={16} /> mc-velocity project docs
					<ExternalLink size={14} />
				</a>
			</div>
		</div>
	);
}
