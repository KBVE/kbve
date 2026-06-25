import { useCallback, useEffect, useState } from 'react';
import { PixelPanel } from '../../PixelPanel';
import { authBridge } from '../../../lib/auth';
import CreatureCodex from '../codex/CreatureCodex';

const ACCENT = '#fcd34d';
const TEXT = '#e6ebf5';
const MUTED = '#9fb3d8';

/**
 * Escape-driven pause menu for the fullscreen arpg embed. Toggling adds
 * `arpg-menu-open` to <body>, which the shell stylesheet uses to bring the
 * starlight nav back over the game. Holds Resume + Exit; a settings slot is
 * left for later. Phaser doesn't bind Escape, so the window listener is safe.
 */
export default function ArpgMenu() {
	const [open, setOpen] = useState(false);
	const [codex, setCodex] = useState(false);

	const close = useCallback(() => setOpen(false), []);

	const signOut = useCallback(async () => {
		try {
			await authBridge.signOut();
		} catch (err) {
			console.error('arpg sign-out failed', err);
		}
		window.location.reload();
	}, []);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			e.preventDefault();
			setOpen((v) => !v);
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);

	useEffect(() => {
		document.body.classList.toggle('arpg-menu-open', open);
		return () => document.body.classList.remove('arpg-menu-open');
	}, [open]);

	return (
		<>
			{codex && <CreatureCodex onClose={() => setCodex(false)} />}
			{open && (
				<div
					style={{
						position: 'absolute',
						inset: 0,
						zIndex: 30,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						background: 'rgba(8,9,14,0.6)',
						backdropFilter: 'blur(3px)',
						fontFamily: 'monospace',
						color: TEXT,
					}}
					onClick={close}>
					<div onClick={(e) => e.stopPropagation()}>
						<PixelPanel
							variant="gold"
							scale={3}
							style={{ minWidth: 260, padding: '20px 22px' }}>
							<div
								style={{
									fontSize: 18,
									fontWeight: 700,
									color: ACCENT,
									textShadow: '0 1px 2px rgba(0,0,0,0.9)',
									textAlign: 'center',
									letterSpacing: 1,
									marginBottom: 16,
								}}>
								PAUSED
							</div>
							<div
								style={{
									display: 'flex',
									flexDirection: 'column',
									gap: 10,
								}}>
								<MenuButton primary onClick={close}>
									Resume
								</MenuButton>
								<MenuButton
									onClick={() => {
										setCodex(true);
										setOpen(false);
									}}>
									Bestiary
								</MenuButton>
								<MenuButton
									onClick={() => {
										window.location.assign('/arcade/');
									}}>
									Exit to Arcade
								</MenuButton>
								<MenuButton onClick={signOut}>
									Sign out
								</MenuButton>
							</div>
							<div
								style={{
									marginTop: 14,
									fontSize: 10,
									color: MUTED,
									textAlign: 'center',
									opacity: 0.7,
								}}>
								Esc to resume
							</div>
						</PixelPanel>
					</div>
				</div>
			)}
		</>
	);
}

function MenuButton({
	children,
	onClick,
	primary = false,
}: {
	children: React.ReactNode;
	onClick: () => void;
	primary?: boolean;
}) {
	return (
		<button
			onClick={onClick}
			style={{
				padding: '11px 14px',
				fontSize: 14,
				fontFamily: 'monospace',
				fontWeight: 700,
				borderRadius: 6,
				border: 'none',
				cursor: 'pointer',
				color: primary ? '#0b0e16' : TEXT,
				background: primary ? ACCENT : 'rgba(76,90,120,0.35)',
				boxShadow: primary
					? '0 0 10px rgba(252,211,77,0.4)'
					: 'inset 0 0 0 1px rgba(120,138,170,0.4)',
				transition: 'filter 120ms',
			}}
			onMouseEnter={(e) => {
				e.currentTarget.style.filter = 'brightness(1.15)';
			}}
			onMouseLeave={(e) => {
				e.currentTarget.style.filter = 'none';
			}}>
			{children}
		</button>
	);
}
