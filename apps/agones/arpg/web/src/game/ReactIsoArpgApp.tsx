import { useEffect, useRef, useState, useCallback } from 'react';
import Phaser from 'phaser';
import {
	isWebGLAvailable,
	installWebGLContextGuard,
	reportWebGLEvent,
} from '@kbve/laser';
import { IsoArpgScene } from './IsoArpgScene';
import WebGLOverlay from './WebGLOverlay';
import ArpgHud from './ArpgHud';
import D2Hud from './ui/D2Hud';
import ArpgMenu from './ArpgMenu';
import ChatPanel from './ChatPanel';
import ArpgToasts from './ArpgToasts';
import {
	COLORS,
	DEBUG_HUD,
	DEBUG_LOCAL_PLAYER,
	USE_D2_HUD,
	resolveWsUrl,
} from './config';
import { buildNetConfig, getNetConfig, setNetConfig } from './net-config';
import { authBridge } from '../lib/auth';
import {
	resolvePlayerName,
	hasSessionName,
	saveName,
	sanitizeName,
} from './playerName';

const CONTAINER_ID = 'iso-arpg-inner';

/**
 * Pre-resolved session for the Discord Activity embed: the embed already ran the
 * Discord OAuth handshake (minting a Supabase JWT + username via axum-kbve), so
 * it hands the credentials straight in and skips the Supabase gate + name prompt.
 */
export interface ArpgEmbedSession {
	jwt: string;
	username: string;
	/** Game server WebSocket. Defaults to the config WS URL (arpg.kbve.com). */
	wsUrl?: string;
}

export default function ReactIsoArpgApp({
	embedSession,
}: {
	embedSession?: ArpgEmbedSession;
} = {}) {
	const gameRef = useRef<Phaser.Game | null>(null);
	// 'loading' while the session resolves, 'prompt' to ask for a name (offline
	// only), 'signin' when online play needs a Supabase session, 'ready' once the
	// scene should boot.
	const [phase, setPhase] = useState<
		'loading' | 'prompt' | 'signin' | 'ready'
	>('loading');
	const [draft, setDraft] = useState('');
	const [glState, setGlState] = useState<'ok' | 'lost' | 'unsupported'>('ok');

	const getDimensions = useCallback(() => {
		const container = document.getElementById(CONTAINER_ID);
		if (!container) return { width: 960, height: 540 };
		const rect = container.getBoundingClientRect();
		return {
			width: Math.floor(rect.width),
			height: Math.floor(rect.height),
		};
	}, []);

	// Resolve session/name: a signed-in username or a previously-saved name
	// boots straight in; otherwise prompt for a display name first. The Discord
	// Activity embed supplies a ready session (jwt + username) directly, so it
	// skips both the Supabase gate and the name prompt.
	useEffect(() => {
		if (embedSession) {
			setNetConfig({
				jwt: embedSession.jwt,
				username: embedSession.username,
				wsUrl: embedSession.wsUrl ?? resolveWsUrl(),
			});
			setPhase('ready');
			return;
		}
		let cancelled = false;
		// Offline sim (PUBLIC_ARPG_LOCAL) drives a local ranger with no server, so a
		// display name is all it needs. Online play requires a real Supabase
		// session — buildNetConfig only resolves with a valid JWT; without one we
		// can't connect (the server denies an empty JWT), so prompt to sign in
		// rather than fake-readying off a stale saved name.
		if (DEBUG_LOCAL_PLAYER) {
			if (hasSessionName() || resolvePlayerName()) {
				setPhase('ready');
			} else {
				setPhase('prompt');
			}
			return () => {
				cancelled = true;
			};
		}
		buildNetConfig().finally(() => {
			if (cancelled) return;
			setPhase(getNetConfig() ? 'ready' : 'signin');
		});
		return () => {
			cancelled = true;
		};
	}, [embedSession]);

	// Boot Phaser once we're in the 'ready' phase.
	useEffect(() => {
		if (phase !== 'ready') return;
		const container = document.getElementById(CONTAINER_ID);
		if (!container || gameRef.current) return;

		if (!isWebGLAvailable()) {
			reportWebGLEvent('unsupported');
			setGlState('unsupported');
			return;
		}

		const dims = getDimensions();
		const config: Phaser.Types.Core.GameConfig = {
			type: Phaser.AUTO,
			width: dims.width,
			height: dims.height,
			parent: container,
			backgroundColor: COLORS.background,
			pixelArt: true,
			scale: {
				mode: Phaser.Scale.RESIZE,
				autoCenter: Phaser.Scale.CENTER_BOTH,
			},
			input: {
				keyboard: {
					target: window,
					capture: [
						Phaser.Input.Keyboard.KeyCodes.UP,
						Phaser.Input.Keyboard.KeyCodes.DOWN,
						Phaser.Input.Keyboard.KeyCodes.LEFT,
						Phaser.Input.Keyboard.KeyCodes.RIGHT,
						Phaser.Input.Keyboard.KeyCodes.W,
						Phaser.Input.Keyboard.KeyCodes.A,
						Phaser.Input.Keyboard.KeyCodes.S,
						Phaser.Input.Keyboard.KeyCodes.D,
					],
				},
			},
			scene: IsoArpgScene,
		};
		gameRef.current = new Phaser.Game(config);

		let disposeGuard: (() => void) | null = null;
		gameRef.current.events.once(Phaser.Core.Events.READY, () => {
			const canvas = gameRef.current?.canvas;
			if (!canvas) return;
			disposeGuard = installWebGLContextGuard(canvas, {
				onLost: () => setGlState('lost'),
				onRestored: () => setGlState('ok'),
			});
		});

		const handleResize = () => {
			if (gameRef.current) {
				const d = getDimensions();
				gameRef.current.scale.resize(d.width, d.height);
			}
		};
		window.addEventListener('resize', handleResize);
		const ro = new ResizeObserver(handleResize);
		ro.observe(container);

		return () => {
			window.removeEventListener('resize', handleResize);
			ro.disconnect();
			disposeGuard?.();
			if (gameRef.current) {
				gameRef.current.destroy(true);
				gameRef.current = null;
			}
		};
	}, [phase, getDimensions]);

	const startWithName = useCallback(() => {
		const name = sanitizeName(draft) || 'Ranger';
		saveName(name);
		setPhase('ready');
	}, [draft]);

	const signIn = useCallback(
		async (provider: 'github' | 'discord' | 'twitch') => {
			try {
				await authBridge.signInWithOAuth(provider);
			} catch (err) {
				console.error('arpg sign-in failed', err);
			}
		},
		[],
	);

	if (phase === 'signin') {
		return (
			<div
				style={{
					position: 'absolute',
					inset: 0,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					background: 'rgba(8,9,14,0.85)',
					zIndex: 20,
				}}>
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: '12px',
						padding: '28px 32px',
						borderRadius: '10px',
						background: '#181c28',
						border: '1px solid #3c465c',
						minWidth: '280px',
						maxWidth: '360px',
						fontFamily: 'monospace',
						color: '#e6ebf5',
						textAlign: 'center',
					}}>
					<div style={{ fontSize: '15px', color: '#fcd34d' }}>
						Sign in to play
					</div>
					<div
						style={{
							fontSize: '13px',
							lineHeight: 1.5,
							color: '#9fb3d8',
						}}>
						The ARPG is server-authoritative and needs a KBVE
						session. Sign in to play.
					</div>
					{(
						[
							['github', 'GitHub', '#6ea8ff'],
							['discord', 'Discord', '#7c83f7'],
							['twitch', 'Twitch', '#a970ff'],
						] as const
					).map(([provider, label, color]) => (
						<button
							key={provider}
							type="button"
							onClick={() => signIn(provider)}
							style={{
								padding: '10px 12px',
								fontSize: '14px',
								fontWeight: 700,
								borderRadius: '6px',
								border: 'none',
								cursor: 'pointer',
								background: color,
								color: '#0b0e16',
							}}>
							Sign in with {label}
						</button>
					))}
				</div>
			</div>
		);
	}

	if (phase === 'prompt') {
		return (
			<div
				style={{
					position: 'absolute',
					inset: 0,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					background: 'rgba(8,9,14,0.85)',
					zIndex: 20,
				}}>
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: '12px',
						padding: '28px 32px',
						borderRadius: '10px',
						background: '#181c28',
						border: '1px solid #3c465c',
						minWidth: '280px',
						fontFamily: 'monospace',
						color: '#e6ebf5',
					}}>
					<div style={{ fontSize: '15px', color: '#fcd34d' }}>
						Enter your name
					</div>
					<input
						autoFocus
						value={draft}
						maxLength={18}
						placeholder="Ranger"
						onChange={(e) => setDraft(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter') startWithName();
						}}
						style={{
							padding: '10px 12px',
							fontSize: '14px',
							fontFamily: 'monospace',
							borderRadius: '6px',
							border: '1px solid #4c5a78',
							background: '#0f1320',
							color: '#e6ebf5',
							outline: 'none',
						}}
					/>
					<button
						onClick={startWithName}
						style={{
							padding: '10px 12px',
							fontSize: '14px',
							fontFamily: 'monospace',
							fontWeight: 700,
							borderRadius: '6px',
							border: 'none',
							background: '#6ea8ff',
							color: '#0b0e16',
							cursor: 'pointer',
						}}>
						Play
					</button>
				</div>
			</div>
		);
	}

	if (glState === 'unsupported') {
		return <WebGLOverlay mode="unsupported" />;
	}

	if (phase === 'ready') {
		return (
			<>
				{USE_D2_HUD ? (
					<D2Hud debug={DEBUG_HUD} />
				) : (
					<ArpgHud debug={DEBUG_HUD} />
				)}
				<ArpgMenu />
				<ArpgToasts />
				{!DEBUG_LOCAL_PLAYER && <ChatPanel />}
				{glState === 'lost' && <WebGLOverlay mode="lost" />}
			</>
		);
	}

	return null;
}
