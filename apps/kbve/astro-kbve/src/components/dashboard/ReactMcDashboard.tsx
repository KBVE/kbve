import { useStore } from '@nanostores/react';
import { ExternalLink, Github, Pickaxe, ShieldOff } from 'lucide-react';
import ServerCard from './mc/ServerCard';
import { homeService } from './homeService';

const REPO_PATH = 'https://github.com/KBVE/kbve/tree/main/apps/kube/agones/mc';
const VELOCITY_DOCS = '/docs/project/mc-velocity/';
const LOBBY_DOCS = '/docs/project/mc-lobby/';

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
		marginBottom: '0.5rem',
	},
	subTitle: {
		margin: '0 0 1.25rem 0',
		color: 'var(--sl-color-gray-3, #8b949e)',
		fontSize: '0.95rem',
	},
	grid: {
		display: 'grid',
		gridTemplateColumns: 'repeat(auto-fit, minmax(22rem, 1fr))',
		gap: '1.25rem',
	},
	links: {
		display: 'flex',
		flexWrap: 'wrap' as const,
		gap: '0.75rem',
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
				<h1 style={styles.heading}>Minecraft Gameops</h1>
			</div>
			<p style={styles.subTitle}>
				Velocity proxy + Paper backends. Per-server status, live player
				roster, and staff-only RCON consoles routed through{' '}
				<code>POST /api/v1/rcon/mc/&#123;server&#125;/exec</code>.
			</p>

			<div style={styles.grid}>
				<ServerCard
					server="velocity"
					label="Velocity Proxy"
					role="Network edge — routes /glist, /alert, /send across backends."
				/>
				<ServerCard
					server="lobby"
					label="Lobby Backend"
					role="Spawn world. List, kick, gamemode, broadcast."
				/>
				<ServerCard
					server="survival"
					label="Survival Backend"
					role="Main play world. Whitelist, bans, world ops."
				/>
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
				<a href={VELOCITY_DOCS} style={styles.linkButton}>
					mc-velocity docs <ExternalLink size={14} />
				</a>
				<a href={LOBBY_DOCS} style={styles.linkButton}>
					mc-lobby docs <ExternalLink size={14} />
				</a>
			</div>
		</div>
	);
}
