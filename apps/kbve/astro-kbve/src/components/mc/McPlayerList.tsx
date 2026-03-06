import { useState, useEffect, useCallback, lazy, Suspense } from 'react';

const McSkinViewer = lazy(() => import('./McSkinViewer'));

interface McPlayer {
	name: string;
	uuid: string | null;
	skin_url: string | null;
}

interface McPlayerListData {
	online: number;
	max: number;
	players: McPlayer[];
	cached_at: number;
}

interface McPlayerListProps {
	apiBaseUrl?: string;
	refreshInterval?: number;
}

const styles = {
	container: {
		borderRadius: '0.5rem',
		border: '1px solid var(--sl-color-gray-5)',
		background: 'var(--sl-color-bg-nav)',
		padding: '1rem',
	} as React.CSSProperties,
	header: {
		display: 'flex',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: '0.75rem',
		paddingBottom: '0.5rem',
		borderBottom: '1px solid var(--sl-color-gray-6)',
	} as React.CSSProperties,
	title: {
		margin: 0,
		fontSize: '1rem',
		fontWeight: 600,
		color: 'var(--sl-color-white)',
	} as React.CSSProperties,
	badge: {
		fontSize: '0.75rem',
		padding: '0.125rem 0.5rem',
		borderRadius: '9999px',
		fontWeight: 600,
	} as React.CSSProperties,
	badgeOnline: {
		background: 'rgba(34, 197, 94, 0.15)',
		color: 'rgb(34, 197, 94)',
	} as React.CSSProperties,
	badgeOffline: {
		background: 'rgba(156, 163, 175, 0.15)',
		color: 'var(--sl-color-gray-3)',
	} as React.CSSProperties,
	playerGrid: {
		display: 'grid',
		gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
		gap: '0.5rem',
	} as React.CSSProperties,
	playerCard: {
		display: 'flex',
		alignItems: 'center',
		gap: '0.625rem',
		padding: '0.5rem',
		borderRadius: '0.375rem',
		background: 'var(--sl-color-bg)',
		border: '1px solid var(--sl-color-gray-6)',
		cursor: 'pointer',
		transition: 'border-color 0.15s, background 0.15s',
	} as React.CSSProperties,
	playerCardHover: {
		borderColor: 'rgb(34, 197, 94)',
		background: 'rgba(34, 197, 94, 0.05)',
	} as React.CSSProperties,
	avatar: {
		width: '32px',
		height: '32px',
		borderRadius: '4px',
		imageRendering: 'pixelated' as const,
		flexShrink: 0,
		background: 'var(--sl-color-gray-6)',
	} as React.CSSProperties,
	playerName: {
		fontSize: '0.875rem',
		fontWeight: 500,
		color: 'var(--sl-color-white)',
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap' as const,
	} as React.CSSProperties,
	empty: {
		textAlign: 'center' as const,
		padding: '2rem 1rem',
		color: 'var(--sl-color-gray-3)',
		fontSize: '0.875rem',
	} as React.CSSProperties,
	loading: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		gap: '0.5rem',
		padding: '2rem',
		color: 'var(--sl-color-gray-3)',
		fontSize: '0.875rem',
	} as React.CSSProperties,
	error: {
		padding: '1rem',
		borderRadius: '0.375rem',
		background: 'rgba(239, 68, 68, 0.1)',
		border: '1px solid rgba(239, 68, 68, 0.3)',
		color: 'rgb(239, 68, 68)',
		fontSize: '0.875rem',
		textAlign: 'center' as const,
	} as React.CSSProperties,
	footer: {
		marginTop: '0.5rem',
		paddingTop: '0.5rem',
		borderTop: '1px solid var(--sl-color-gray-6)',
		display: 'flex',
		justifyContent: 'space-between',
		alignItems: 'center',
		fontSize: '0.7rem',
		color: 'var(--sl-color-gray-4)',
	} as React.CSSProperties,
	retryBtn: {
		cursor: 'pointer',
		background: 'none',
		border: '1px solid rgba(239, 68, 68, 0.5)',
		borderRadius: '0.25rem',
		color: 'rgb(239, 68, 68)',
		padding: '0.25rem 0.75rem',
		fontSize: '0.75rem',
		marginTop: '0.5rem',
	} as React.CSSProperties,
	backdrop: {
		position: 'fixed' as const,
		inset: 0,
		background: 'rgba(0, 0, 0, 0.4)',
		zIndex: 9998,
		transition: 'opacity 0.3s ease',
	} as React.CSSProperties,
	panel: {
		position: 'fixed' as const,
		top: 0,
		right: 0,
		width: '360px',
		maxWidth: '90vw',
		height: '100vh',
		background: 'var(--sl-color-bg-nav)',
		borderLeft: '1px solid var(--sl-color-gray-5)',
		zIndex: 9999,
		display: 'flex',
		flexDirection: 'column' as const,
		transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
	} as React.CSSProperties,
	panelHeader: {
		display: 'flex',
		justifyContent: 'space-between',
		alignItems: 'center',
		padding: '1rem 1.25rem',
		borderBottom: '1px solid var(--sl-color-gray-6)',
	} as React.CSSProperties,
	panelTitle: {
		display: 'flex',
		alignItems: 'center',
		gap: '0.75rem',
	} as React.CSSProperties,
	panelPlayerName: {
		fontSize: '1.125rem',
		fontWeight: 600,
		color: 'var(--sl-color-white)',
	} as React.CSSProperties,
	panelCloseBtn: {
		cursor: 'pointer',
		background: 'none',
		border: '1px solid var(--sl-color-gray-5)',
		borderRadius: '0.375rem',
		color: 'var(--sl-color-gray-3)',
		padding: '0.25rem 0.5rem',
		fontSize: '1rem',
		lineHeight: 1,
	} as React.CSSProperties,
	panelBody: {
		flex: 1,
		display: 'flex',
		flexDirection: 'column' as const,
		alignItems: 'center',
		justifyContent: 'center',
		padding: '1rem',
		overflow: 'hidden',
	} as React.CSSProperties,
	panelFooter: {
		padding: '0.75rem 1.25rem',
		borderTop: '1px solid var(--sl-color-gray-6)',
		fontSize: '0.75rem',
		color: 'var(--sl-color-gray-4)',
		textAlign: 'center' as const,
	} as React.CSSProperties,
	panelUuid: {
		fontFamily: 'monospace',
		fontSize: '0.7rem',
		color: 'var(--sl-color-gray-4)',
		wordBreak: 'break-all' as const,
	} as React.CSSProperties,
	panelOnlineBadge: {
		display: 'inline-block',
		width: '8px',
		height: '8px',
		borderRadius: '50%',
		background: 'rgb(34, 197, 94)',
		flexShrink: 0,
	} as React.CSSProperties,
	skinLoading: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		width: '100%',
		height: '300px',
		color: 'var(--sl-color-gray-3)',
		fontSize: '0.875rem',
	} as React.CSSProperties,
	noSkinMsg: {
		textAlign: 'center' as const,
		padding: '2rem',
		color: 'var(--sl-color-gray-3)',
		fontSize: '0.875rem',
	} as React.CSSProperties,
};

function craftHeadUrl(uuid: string | null): string {
	if (!uuid) return '';
	const cleanUuid = uuid.replace(/-/g, '');
	return `https://mc-heads.net/avatar/${cleanUuid}/32`;
}

function formatCachedAt(epoch: number): string {
	if (!epoch) return '';
	const diff = Math.floor(Date.now() / 1000) - epoch;
	if (diff < 5) return 'just now';
	if (diff < 60) return `${diff}s ago`;
	if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
	return `${Math.floor(diff / 3600)}h ago`;
}

function PlayerCard({
	player,
	onSelect,
}: {
	player: McPlayer;
	onSelect: (p: McPlayer) => void;
}) {
	const [hovered, setHovered] = useState(false);

	return (
		<div
			style={{
				...styles.playerCard,
				...(hovered ? styles.playerCardHover : {}),
			}}
			onClick={() => onSelect(player)}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}>
			{player.uuid ? (
				<img
					src={craftHeadUrl(player.uuid)}
					alt={player.name}
					style={styles.avatar}
					loading="lazy"
				/>
			) : (
				<div style={styles.avatar} />
			)}
			<span style={styles.playerName}>{player.name}</span>
		</div>
	);
}

function PlayerPanel({
	player,
	visible,
	onClose,
}: {
	player: McPlayer;
	visible: boolean;
	onClose: () => void;
}) {
	useEffect(() => {
		const handleKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		if (visible) {
			document.addEventListener('keydown', handleKey);
			return () => document.removeEventListener('keydown', handleKey);
		}
	}, [visible, onClose]);

	return (
		<>
			<div
				style={{
					...styles.backdrop,
					opacity: visible ? 1 : 0,
					pointerEvents: visible ? 'auto' : 'none',
				}}
				onClick={onClose}
			/>
			<div
				style={{
					...styles.panel,
					transform: visible ? 'translateX(0)' : 'translateX(100%)',
				}}>
				<div style={styles.panelHeader}>
					<div style={styles.panelTitle}>
						{player.uuid && (
							<img
								src={craftHeadUrl(player.uuid)}
								alt={player.name}
								style={{
									...styles.avatar,
									width: '24px',
									height: '24px',
								}}
							/>
						)}
						<span style={styles.panelPlayerName}>
							{player.name}
						</span>
						<span style={styles.panelOnlineBadge} />
					</div>
					<button
						type="button"
						style={styles.panelCloseBtn}
						onClick={onClose}>
						&#x2715;
					</button>
				</div>

				<div style={styles.panelBody}>
					{player.uuid ? (
						<Suspense
							fallback={
								<div style={styles.skinLoading}>
									Loading 3D model...
								</div>
							}>
							<McSkinViewer
								uuid={player.uuid}
								width={320}
								height={420}
							/>
						</Suspense>
					) : (
						<div style={styles.noSkinMsg}>
							No skin data available for this player.
						</div>
					)}
				</div>

				<div style={styles.panelFooter}>
					{player.uuid && (
						<span style={styles.panelUuid}>{player.uuid}</span>
					)}
				</div>
			</div>
		</>
	);
}

export default function McPlayerList({
	apiBaseUrl = '',
	refreshInterval = 20000,
}: McPlayerListProps) {
	const [data, setData] = useState<McPlayerListData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [selectedPlayer, setSelectedPlayer] = useState<McPlayer | null>(null);
	const [panelVisible, setPanelVisible] = useState(false);

	const fetchPlayers = useCallback(async () => {
		try {
			const resp = await fetch(`${apiBaseUrl}/api/v1/mc/players`);
			if (!resp.ok) {
				throw new Error(
					resp.status === 503
						? 'MC server not connected'
						: `Failed to fetch: ${resp.status}`,
				);
			}
			const json: McPlayerListData = await resp.json();
			setData(json);
			setError(null);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : 'Failed to fetch players',
			);
		} finally {
			setLoading(false);
		}
	}, [apiBaseUrl]);

	useEffect(() => {
		fetchPlayers();
		if (refreshInterval > 0) {
			const interval = setInterval(fetchPlayers, refreshInterval);
			return () => clearInterval(interval);
		}
	}, [fetchPlayers, refreshInterval]);

	const openPanel = useCallback((player: McPlayer) => {
		setSelectedPlayer(player);
		requestAnimationFrame(() => setPanelVisible(true));
	}, []);

	const closePanel = useCallback(() => {
		setPanelVisible(false);
		setTimeout(() => setSelectedPlayer(null), 300);
	}, []);

	if (loading) {
		return (
			<div style={{ ...styles.container, ...styles.loading }}>
				Loading player data...
			</div>
		);
	}

	if (error) {
		return (
			<div style={styles.container}>
				<div style={styles.error}>
					{error}
					<br />
					<button
						type="button"
						style={styles.retryBtn}
						onClick={() => {
							setLoading(true);
							fetchPlayers();
						}}>
						Retry
					</button>
				</div>
			</div>
		);
	}

	if (!data) return null;

	const isOnline = data.online > 0;

	return (
		<div style={styles.container}>
			<div style={styles.header}>
				<h3 style={styles.title}>mc.kbve.com</h3>
				<span
					style={{
						...styles.badge,
						...(isOnline
							? styles.badgeOnline
							: styles.badgeOffline),
					}}>
					{data.online} / {data.max} online
				</span>
			</div>

			{data.players.length === 0 ? (
				<div style={styles.empty}>
					No players online right now. Connect at{' '}
					<strong>mc.kbve.com</strong>
				</div>
			) : (
				<div style={styles.playerGrid}>
					{data.players.map((player) => (
						<PlayerCard
							key={player.name}
							player={player}
							onSelect={openPanel}
						/>
					))}
				</div>
			)}

			<div style={styles.footer}>
				<span>Updated {formatCachedAt(data.cached_at)}</span>
				<span>Auto-refreshes every {refreshInterval / 1000}s</span>
			</div>

			{selectedPlayer && (
				<PlayerPanel
					player={selectedPlayer}
					visible={panelVisible}
					onClose={closePanel}
				/>
			)}
		</div>
	);
}
