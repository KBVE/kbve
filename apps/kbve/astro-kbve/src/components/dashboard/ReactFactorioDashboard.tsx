import { useStore } from '@nanostores/react';
import {
	Factory,
	ShieldOff,
	Github,
	ExternalLink,
	Container,
	Server,
	Clock,
} from 'lucide-react';
import { homeService } from './homeService';

const IMAGE_NAME = 'ghcr.io/kbve/agones-factorio';
const FACTORIO_VERSION = '2.0.76';
const ISSUE_URL = 'https://github.com/KBVE/kbve/issues/11138';
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
	statusRow: {
		display: 'inline-flex',
		alignItems: 'center',
		gap: '0.5rem',
		padding: '0.35rem 0.75rem',
		borderRadius: '999px',
		fontSize: '0.85rem',
		fontWeight: 500,
		background: 'rgba(210, 153, 34, 0.15)',
		color: 'var(--sl-color-orange, #d29922)',
		border: '1px solid rgba(210, 153, 34, 0.4)',
	},
	statusDot: {
		width: '0.5rem',
		height: '0.5rem',
		borderRadius: '50%',
		background: 'var(--sl-color-orange, #d29922)',
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
	roadmap: {
		marginTop: '2rem',
		padding: '1.25rem',
		borderRadius: '0.75rem',
		border: '1px solid var(--sl-color-gray-5, #30363d)',
		background: 'var(--sl-color-bg-nav, rgba(13, 17, 23, 0.6))',
	},
	roadmapList: {
		margin: '0.75rem 0 0',
		paddingLeft: '1.25rem',
		display: 'flex',
		flexDirection: 'column' as const,
		gap: '0.4rem',
		color: 'var(--sl-color-gray-2, #c9d1d9)',
		fontSize: '0.9rem',
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

export default function ReactFactorioDashboard() {
	const isStaff = useStore(homeService.$isStaff);

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

	return (
		<div>
			<div style={styles.header}>
				<Factory size={28} color="var(--sl-color-accent, #2f81f7)" />
				<h1 style={styles.heading}>Factorio</h1>
			</div>
			<span style={styles.statusRow}>
				<span style={styles.statusDot} />
				Phase 0 · Image published · No live data yet
			</span>

			<div style={styles.grid}>
				<div style={styles.card}>
					<div style={styles.cardLabel}>
						<Container size={16} />
						Image
					</div>
					<p style={styles.cardValue}>{IMAGE_NAME}</p>
				</div>
				<div style={styles.card}>
					<div style={styles.cardLabel}>
						<Server size={16} />
						Factorio version
					</div>
					<p style={styles.cardValue}>{FACTORIO_VERSION}</p>
				</div>
				<div style={styles.card}>
					<div style={styles.cardLabel}>
						<Clock size={16} />
						GameServer / Fleet
					</div>
					<p style={styles.cardValue}>not deployed (Phase 1)</p>
				</div>
			</div>

			<div style={styles.roadmap}>
				<strong>Phasing</strong>
				<ul style={styles.roadmapList}>
					<li>
						Phase 0 — Custom image, KBVE scenario, lifecycle shim
						(done).
					</li>
					<li>
						Phase 1 — <code>apps/kube/agones/factorio/</code>{' '}
						GameServer / Fleet + UDP service.
					</li>
					<li>
						Phase 2 — ConfigMap-driven{' '}
						<code>server-settings.json</code> +{' '}
						<code>ExternalSecret</code> for matchmaking token and
						RCON password.
					</li>
					<li>
						Phase 3 — <code>apps/agones/factorio/relay/</code> chat
						relay sidecar (Rust) → IRC → existing Discord bridge.
					</li>
					<li>
						Phase 2.5+ — <code>factorio-ctl</code> Axum REST API;
						wires player count, save rotation, RCON passthrough into
						this dashboard.
					</li>
					<li>
						Phase 4 — PVC + rotation CronJob, public save download
						URL.
					</li>
					<li>Phase 5 — Log / RCON metrics + UPS / player alerts.</li>
				</ul>
			</div>

			<div style={styles.links}>
				<a
					href={ISSUE_URL}
					target="_blank"
					rel="noopener"
					style={styles.linkButton}>
					<Github size={16} /> Tracking issue #11138
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
