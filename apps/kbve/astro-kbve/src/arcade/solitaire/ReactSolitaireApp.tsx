import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { SolitaireScene } from './SolitaireScene';
import { BASE_HEIGHT, BASE_WIDTH, COLORS } from './config';

/**
 * Klondike solitaire mounted via raw `new Phaser.Game()` inside an effect.
 *
 * React owns the container via ref (no `document.getElementById` lookup),
 * so the component composes cleanly across hot reload, SSR-ish renders,
 * and multiple instances. Internal game size stays at the logical
 * `BASE_WIDTH × BASE_HEIGHT` board — Phaser's Scale.FIT scales the canvas
 * to whatever the parent ends up sized to. Card positions, drag math, and
 * hitboxes all live in stable game coordinates.
 *
 * Resize is throttled to one rAF tick to avoid hammering `scale.refresh`
 * during layout transitions (tabs, modals, container animations).
 */
export default function ReactSolitaireApp() {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const gameRef = useRef<Phaser.Game | null>(null);
	const resizeFrameRef = useRef<number | null>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container || gameRef.current) return;

		const config: Phaser.Types.Core.GameConfig = {
			type: Phaser.AUTO,
			width: BASE_WIDTH,
			height: BASE_HEIGHT,
			parent: container,
			backgroundColor: COLORS.background,
			scale: {
				mode: Phaser.Scale.FIT,
				autoCenter: Phaser.Scale.CENTER_BOTH,
				width: BASE_WIDTH,
				height: BASE_HEIGHT,
			},
			input: {
				keyboard: {
					target: window,
					capture: [
						Phaser.Input.Keyboard.KeyCodes.N,
						Phaser.Input.Keyboard.KeyCodes.Z,
					],
				},
			},
			render: {
				antialias: true,
				pixelArt: false,
			},
			scene: SolitaireScene,
		};

		gameRef.current = new Phaser.Game(config);

		const refresh = () => {
			if (resizeFrameRef.current !== null) return;
			resizeFrameRef.current = window.requestAnimationFrame(() => {
				resizeFrameRef.current = null;
				gameRef.current?.scale.refresh();
			});
		};

		const ro = new ResizeObserver(refresh);
		ro.observe(container);
		window.addEventListener('resize', refresh, { passive: true });

		return () => {
			window.removeEventListener('resize', refresh);
			ro.disconnect();
			if (resizeFrameRef.current !== null) {
				window.cancelAnimationFrame(resizeFrameRef.current);
				resizeFrameRef.current = null;
			}
			gameRef.current?.destroy(true);
			gameRef.current = null;
		};
	}, []);

	return <div ref={containerRef} className="h-full w-full overflow-hidden" />;
}
