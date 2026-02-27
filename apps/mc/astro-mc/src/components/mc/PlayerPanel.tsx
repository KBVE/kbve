import {
	useEffect,
	useCallback,
	useState,
	lazy,
	Suspense,
	type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@nanostores/react';
import { $playerPanel, closePlayerPanel } from '../../lib/player-panel-store';
import { loadSkinDataUrl } from '../../lib/mojang';
import PlayerAvatar from './PlayerAvatar';

const MinecraftSkinViewer = lazy(() => import('./MinecraftSkin'));

const PANEL_WIDTH = 380;

const backdropStyle: CSSProperties = {
	position: 'fixed',
	inset: 0,
	zIndex: 9998,
	backgroundColor: 'rgba(0, 0, 0, 0.5)',
	backdropFilter: 'blur(2px)',
	transition: 'opacity 200ms ease',
};

const panelStyle: CSSProperties = {
	position: 'fixed',
	top: 0,
	right: 0,
	bottom: 0,
	width: PANEL_WIDTH,
	zIndex: 9999,
	backgroundColor: 'var(--sl-color-bg-nav, #0a0a0a)',
	borderLeft: '1px solid var(--sl-color-hairline, #27272a)',
	boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.4)',
	transition: 'transform 250ms cubic-bezier(0.32, 0.72, 0, 1)',
	display: 'flex',
	flexDirection: 'column',
	overflow: 'hidden',
};

const headerStyle: CSSProperties = {
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'space-between',
	padding: '1rem 1.25rem',
	borderBottom: '1px solid var(--sl-color-hairline, #27272a)',
};

const closeBtnStyle: CSSProperties = {
	background: 'none',
	border: 'none',
	color: 'var(--sl-color-gray-3, #71717a)',
	fontSize: '1.25rem',
	cursor: 'pointer',
	padding: '0.25rem',
	lineHeight: 1,
};

const viewerContainerStyle: CSSProperties = {
	flex: 1,
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center',
	minHeight: 0,
};

const infoStyle: CSSProperties = {
	padding: '1rem 1.25rem',
	borderTop: '1px solid var(--sl-color-hairline, #27272a)',
};

export default function PlayerPanel() {
	const { open, player } = useStore($playerPanel);
	const [skinDataUrl, setSkinDataUrl] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	// Load skin when panel opens with a player
	useEffect(() => {
		if (!open || !player?.skinUrl || !player.uuid) {
			setSkinDataUrl(null);
			return;
		}
		setLoading(true);
		loadSkinDataUrl(player.uuid, player.skinUrl).then((url) => {
			setSkinDataUrl(url);
			setLoading(false);
		});
	}, [open, player?.uuid, player?.skinUrl]);

	// Escape key handler
	useEffect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') closePlayerPanel();
		};
		document.addEventListener('keydown', handler);
		return () => document.removeEventListener('keydown', handler);
	}, [open]);

	// Body scroll lock
	useEffect(() => {
		if (!open) return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = prev;
		};
	}, [open]);

	const handleBackdropClick = useCallback(() => {
		closePlayerPanel();
	}, []);

	if (!open) return null;

	return createPortal(
		<>
			<div
				style={{ ...backdropStyle, opacity: 1 }}
				onClick={handleBackdropClick}
				aria-hidden
			/>
			<div
				style={{
					...panelStyle,
					transform: 'translateX(0)',
				}}
				role="dialog"
				aria-label={`Player profile: ${player?.name ?? ''}`}>
				<div style={headerStyle}>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 10,
						}}>
						<PlayerAvatar skinDataUrl={skinDataUrl} size={28} />
						<span style={{ fontWeight: 600, fontSize: '1rem' }}>
							{player?.name}
						</span>
					</div>
					<button
						style={closeBtnStyle}
						onClick={closePlayerPanel}
						aria-label="Close panel">
						&times;
					</button>
				</div>

				<div style={viewerContainerStyle}>
					{loading && (
						<div
							style={{
								color: 'var(--sl-color-gray-3, #71717a)',
								fontSize: '0.875rem',
							}}>
							Loading skin...
						</div>
					)}
					{skinDataUrl && (
						<Suspense
							fallback={
								<div
									style={{
										color: 'var(--sl-color-gray-3)',
										fontSize: '0.875rem',
									}}>
									Loading 3D viewer...
								</div>
							}>
							<MinecraftSkinViewer
								skinDataUrl={skinDataUrl}
								width={PANEL_WIDTH - 2}
								height={380}
							/>
						</Suspense>
					)}
					{!loading && !skinDataUrl && (
						<div
							style={{
								color: 'var(--sl-color-gray-3, #71717a)',
								fontSize: '0.875rem',
							}}>
							No skin available
						</div>
					)}
				</div>

				<div style={infoStyle}>
					{player?.uuid && (
						<div
							style={{
								fontSize: '0.75rem',
								color: 'var(--sl-color-gray-3, #71717a)',
								fontFamily: 'monospace',
								wordBreak: 'break-all',
							}}>
							UUID: {player.uuid}
						</div>
					)}
				</div>
			</div>
		</>,
		document.body,
	);
}
