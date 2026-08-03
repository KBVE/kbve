import { useEffect, useRef } from 'react';
import { useActiveInteract } from './registry';
import { isMining, mineProgress } from '../character/mineChannel';

// Verb-driven [F] prompt: shows whatever the nearest interactable named (unlock
// the door, mine the rock, ...). Presentation only; targeting lives in registry.
// While a channel runs the prompt grows a fill bar, written straight to the DOM
// from rAF — re-rendering React every frame for a progress bar is pure waste.
export function InteractPrompt() {
	const active = useActiveInteract();
	const wrapRef = useRef<HTMLDivElement>(null);
	const barRef = useRef<HTMLDivElement>(null);
	const labelRef = useRef<HTMLSpanElement>(null);

	useEffect(() => {
		let raf = 0;
		let shown: boolean | null = null;
		const tick = () => {
			raf = requestAnimationFrame(tick);
			const wrap = wrapRef.current;
			const bar = barRef.current;
			if (!wrap || !bar) return;
			const on = isMining();
			if (on !== shown) {
				shown = on;
				wrap.style.opacity = on ? '1' : '0';
				if (labelRef.current)
					labelRef.current.style.opacity = on ? '0.5' : '1';
			}
			if (on)
				bar.style.width = `${(
					mineProgress(performance.now()) * 100
				).toFixed(1)}%`;
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [active?.id]);

	if (!active) return null;
	return (
		<div
			style={{
				position: 'fixed',
				left: '50%',
				top: '58%',
				transform: 'translate(-50%, 0)',
				padding: '8px 16px',
				background: 'rgba(10,10,14,0.82)',
				border: '1px solid #5a4a32',
				borderRadius: 6,
				color: '#e8dcc0',
				font: '13px monospace',
				letterSpacing: 0.4,
				pointerEvents: 'none',
				textShadow: '0 1px 2px #000',
			}}>
			<span ref={labelRef}>
				Press{' '}
				<span
					style={{
						padding: '1px 6px',
						margin: '0 2px',
						background: '#2a2418',
						border: '1px solid #6b5836',
						borderRadius: 4,
						color: '#ffe9b0',
					}}>
					F
				</span>{' '}
				to {active.verb}
			</span>
			<div
				ref={wrapRef}
				style={{
					opacity: 0,
					height: 4,
					marginTop: 6,
					background: '#2a2418',
					border: '1px solid #6b5836',
					borderRadius: 3,
					overflow: 'hidden',
				}}>
				<div
					ref={barRef}
					style={{
						width: '0%',
						height: '100%',
						background: '#ffe9b0',
					}}
				/>
			</div>
		</div>
	);
}
