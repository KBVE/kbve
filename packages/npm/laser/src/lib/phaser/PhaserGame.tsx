import React, {
	useRef,
	useEffect,
	useState,
	useImperativeHandle,
	forwardRef,
	useMemo,
} from 'react';
import Phaser from 'phaser';
import type { LaserGameConfig, GameStatus } from '../core/types';
import { laserEvents } from '../core/events';
import { PhaserContext, type PhaserGameRef } from './use-phaser';

export type { PhaserGameRef };

export interface PhaserGameProps {
	config: LaserGameConfig;
	onReady?: (game: Phaser.Game) => void;
	onDestroy?: () => void;
	className?: string;
	style?: React.CSSProperties;
	children?: React.ReactNode;
}

/**
 * React-managed Phaser canvas.
 *
 * StrictMode safety: React 18+ runs effects twice in dev (mount → cleanup →
 * mount) to surface broken cleanups. A naive Phaser wrapper destroys the
 * Game on the first cleanup and creates a new one on the re-mount, which
 * tears down the WebGL context mid-init — visible as a "green canvas, no
 * sprites" failure where the scene's `create()` ran on the original Game
 * but the canvas was orphaned by the destroy.
 *
 * Fix: deferred destroy. On cleanup we don't actually destroy the Game —
 * we schedule a destroy via `setTimeout(0)`. If the same component re-
 * mounts before the timeout fires (StrictMode case), the new effect run
 * cancels the pending destroy and re-attaches Phaser's existing canvas to
 * the (potentially recreated) container div. On a real unmount the
 * timeout actually fires + tears the Game down.
 *
 * This is the standard React-with-imperative-runtime pattern (same shape
 * used for Three.js, Tauri webviews, etc).
 */
export const PhaserGame = forwardRef<PhaserGameRef, PhaserGameProps>(
	function PhaserGame(
		{ config, onReady, onDestroy, className, style, children },
		ref,
	) {
		const containerRef = useRef<HTMLDivElement>(null);
		const gameRef = useRef<Phaser.Game | null>(null);
		/** setTimeout id for the deferred destroy. Cleared on re-mount. */
		const pendingDestroyRef = useRef<number | null>(null);
		const [status, setStatus] = useState<GameStatus>('idle');

		useImperativeHandle(
			ref,
			() => ({
				game: gameRef.current,
				status,
			}),
			[status],
		);

		useEffect(() => {
			if (!containerRef.current) return;
			const container = containerRef.current;

			// Cancel any in-flight deferred destroy from a prior cleanup.
			// In StrictMode this is the path that catches the spurious
			// double-mount and prevents the Game from being torn down.
			if (pendingDestroyRef.current !== null) {
				window.clearTimeout(pendingDestroyRef.current);
				pendingDestroyRef.current = null;
			}

			if (gameRef.current) {
				// Reuse existing Game instance from the prior mount. If
				// React replaced the container element between mounts, move
				// Phaser's canvas into the new one.
				const existingCanvas = gameRef.current.canvas;
				if (
					existingCanvas &&
					existingCanvas.parentElement !== container
				) {
					container.appendChild(existingCanvas);
				}
				setStatus(gameRef.current.isBooted ? 'running' : 'booting');
				return scheduleCleanup;
			}

			setStatus('booting');

			// Build Phaser config conditionally — Phaser treats `field:
			// undefined` differently from `field` absent, and at least the
			// `audio` slot crashes (`audioConfig.noAudio` lookup) when set
			// to undefined. Spread only the fields the caller supplied.
			const phaserConfig: Phaser.Types.Core.GameConfig = {
				type: Phaser.AUTO,
				width: config.width ?? 800,
				height: config.height ?? 600,
				parent: container,
				scene: config.scenes,
				backgroundColor: config.backgroundColor,
				transparent: config.transparent,
				...(config.physics && { physics: config.physics }),
				...(config.plugins && { plugins: config.plugins }),
				...(config.scale && { scale: config.scale }),
				...(config.input && { input: config.input }),
				...(config.render || config.pixelArt
					? {
							render: config.pixelArt
								? {
										pixelArt: true,
										antialias: false,
										...config.render,
									}
								: config.render,
						}
					: {}),
				...(config.dom && { dom: config.dom }),
				...(config.audio && { audio: config.audio }),
				...(config.callbacks && { callbacks: config.callbacks }),
				...(config.fps && { fps: config.fps }),
			};
			const game = new Phaser.Game(phaserConfig);

			gameRef.current = game;

			game.events.once('ready', () => {
				if (gameRef.current === game) {
					setStatus('running');
					laserEvents.emit('game:ready', { game });
					onReady?.(game);
				}
			});

			return scheduleCleanup;

			function scheduleCleanup() {
				// Defer destroy to the next tick. If StrictMode is going to
				// re-mount, the next effect run cancels this. Real unmount
				// lets it fire.
				pendingDestroyRef.current = window.setTimeout(() => {
					pendingDestroyRef.current = null;
					const current = gameRef.current;
					if (!current) return;
					setStatus('destroyed');
					laserEvents.emit('game:destroy', undefined as never);
					onDestroy?.();
					current.destroy(true);
					gameRef.current = null;
				}, 0);
			}
		}, [config, onReady, onDestroy]);

		const contextValue = useMemo<PhaserGameRef>(
			() => ({ game: gameRef.current, status }),
			[status],
		);

		return (
			<PhaserContext.Provider value={contextValue}>
				<div ref={containerRef} className={className} style={style} />
				{children}
			</PhaserContext.Provider>
		);
	},
);
