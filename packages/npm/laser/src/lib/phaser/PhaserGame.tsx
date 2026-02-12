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

export const PhaserGame = forwardRef<PhaserGameRef, PhaserGameProps>(
	function PhaserGame(
		{ config, onReady, onDestroy, className, style, children },
		ref,
	) {
		const containerRef = useRef<HTMLDivElement>(null);
		const gameRef = useRef<Phaser.Game | null>(null);
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

			setStatus('booting');

			const game = new Phaser.Game({
				type: Phaser.AUTO,
				width: config.width ?? 800,
				height: config.height ?? 600,
				parent: containerRef.current,
				scene: config.scenes,
				physics: config.physics,
				plugins: config.plugins,
				scale: config.scale,
				backgroundColor: config.backgroundColor,
				transparent: config.transparent,
			});

			gameRef.current = game;

			game.events.once('ready', () => {
				setStatus('running');
				laserEvents.emit('game:ready', { game });
				onReady?.(game);
			});

			return () => {
				setStatus('destroyed');
				laserEvents.emit('game:destroy', undefined as never);
				onDestroy?.();
				game.destroy(true);
				gameRef.current = null;
			};
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
