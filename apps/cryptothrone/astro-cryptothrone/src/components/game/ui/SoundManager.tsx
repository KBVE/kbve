import { useEffect, useRef, useState } from 'react';
import { laserEvents } from '@kbve/laser';

type Ctx = AudioContext | null;

function beep(
	ctx: AudioContext,
	freq: number,
	dur: number,
	type: OscillatorType,
	gain = 0.05,
) {
	const o = ctx.createOscillator();
	const g = ctx.createGain();
	o.type = type;
	o.frequency.value = freq;
	g.gain.value = gain;
	o.connect(g);
	g.connect(ctx.destination);
	const t = ctx.currentTime;
	g.gain.setValueAtTime(gain, t);
	g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
	o.start(t);
	o.stop(t + dur);
}

export function SoundManager() {
	const ctxRef = useRef<Ctx>(null);
	const [muted, setMuted] = useState(false);
	const mutedRef = useRef(false);
	mutedRef.current = muted;

	useEffect(() => {
		const ensure = (): AudioContext | null => {
			if (mutedRef.current) return null;
			if (!ctxRef.current) {
				try {
					ctxRef.current = new (
						window.AudioContext ||
						(
							window as unknown as {
								webkitAudioContext: typeof AudioContext;
							}
						).webkitAudioContext
					)();
				} catch {
					return null;
				}
			}
			if (ctxRef.current.state === 'suspended') ctxRef.current.resume();
			return ctxRef.current;
		};
		const offs = [
			laserEvents.on('combat:event', (d) => {
				const cx = ensure();
				if (!cx) return;
				const e = d as { died: boolean };
				if (e.died) {
					beep(cx, 330, 0.12, 'sawtooth', 0.05);
					setTimeout(() => beep(cx, 165, 0.18, 'sawtooth', 0.05), 90);
				} else {
					beep(cx, 220, 0.08, 'square', 0.04);
				}
			}),
			laserEvents.on('item:pickup', () => {
				const cx = ensure();
				if (cx) beep(cx, 880, 0.07, 'sine', 0.05);
			}),
			laserEvents.on('item:used', () => {
				const cx = ensure();
				if (cx) beep(cx, 660, 0.1, 'triangle', 0.05);
			}),
			laserEvents.on('notification', (d) => {
				const n = d as { title?: string };
				if (!n.title?.startsWith('Level')) return;
				const cx = ensure();
				if (!cx) return;
				[523, 659, 784].forEach((f, i) =>
					setTimeout(
						() => beep(cx, f, 0.14, 'triangle', 0.05),
						i * 110,
					),
				);
			}),
		];
		return () => offs.forEach((o) => o());
	}, []);

	return (
		<button
			type="button"
			onClick={() => setMuted((m) => !m)}
			aria-label={muted ? 'Unmute' : 'Mute'}
			className="pointer-events-auto absolute right-3 top-40 z-30 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/55 text-stone-300 backdrop-blur-md transition hover:text-amber-300">
			{muted ? '🔇' : '🔊'}
		</button>
	);
}
