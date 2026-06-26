import { useCallback, useEffect, useState } from 'react';
import { authBridge } from '../../../lib/auth';
import CreatureCodex from '../codex/CreatureCodex';
import ItemCodex from '../codex/ItemCodex';
import {
	GothicPanel,
	GothicTitleBar,
	GothicButton,
	useMountTransition,
} from '../gothic/Gothic';

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
	const [itemCodex, setItemCodex] = useState(false);

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

	const { mounted, shown } = useMountTransition(open, 200);

	return (
		<>
			{codex && <CreatureCodex onClose={() => setCodex(false)} />}
			{itemCodex && <ItemCodex onClose={() => setItemCodex(false)} />}
			{mounted && (
				<div
					style={{
						position: 'absolute',
						inset: 0,
						zIndex: 30,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						background: shown
							? 'rgba(8,9,14,0.6)'
							: 'rgba(8,9,14,0)',
						backdropFilter: shown ? 'blur(3px)' : 'blur(0px)',
						pointerEvents: shown ? 'auto' : 'none',
						transition:
							'background 0.2s ease, backdrop-filter 0.2s ease',
						fontFamily: 'monospace',
						color: TEXT,
					}}
					onClick={close}>
					<div
						onClick={(e) => e.stopPropagation()}
						style={{
							transformOrigin: 'center',
							transform: shown ? 'scale(1)' : 'scale(0.9)',
							opacity: shown ? 1 : 0,
							transition:
								'transform 0.2s cubic-bezier(0.2,0.8,0.3,1.1), opacity 0.2s ease',
						}}>
						<GothicPanel
							padding={18}
							style={{
								width: 280,
								filter: 'drop-shadow(0 14px 40px rgba(0,0,0,0.6))',
							}}>
							<GothicTitleBar style={{ marginBottom: 14 }}>
								PAUSED
							</GothicTitleBar>
							<div
								style={{
									display: 'flex',
									flexDirection: 'column',
									gap: 8,
								}}>
								<MenuButton onClick={close}>Resume</MenuButton>
								<MenuButton
									onClick={() => {
										setCodex(true);
										setOpen(false);
									}}>
									Bestiary
								</MenuButton>
								<MenuButton
									onClick={() => {
										setItemCodex(true);
										setOpen(false);
									}}>
									Item Codex
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
									marginTop: 12,
									fontSize: 10,
									color: MUTED,
									textAlign: 'center',
									opacity: 0.7,
								}}>
								Esc to resume
							</div>
						</GothicPanel>
					</div>
				</div>
			)}
		</>
	);
}

function MenuButton({
	children,
	onClick,
}: {
	children: React.ReactNode;
	onClick: () => void;
}) {
	return (
		<GothicButton
			onClick={onClick}
			style={{
				width: '100%',
				minWidth: 0,
				transition: 'filter 120ms',
			}}
			onMouseEnter={(e) => {
				e.currentTarget.style.filter = 'brightness(1.18)';
			}}
			onMouseLeave={(e) => {
				e.currentTarget.style.filter = 'none';
			}}>
			{children}
		</GothicButton>
	);
}
