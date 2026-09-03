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
			laserEvents.on('blackjack:sfx', (d) => {
				const cx = ensure();
				if (!cx) return;
				const { kind } = d as { kind: string };
				const arp = (freqs: number[], step = 90, gain = 0.05) =>
					freqs.forEach((f, i) =>
						setTimeout(
							() => beep(cx, f, 0.15, 'triangle', gain),
							i * step,
						),
					);
				switch (kind) {
					case 'card':
						beep(cx, 1100, 0.03, 'square', 0.025);
						break;
					case 'flip':
						beep(cx, 760, 0.05, 'square', 0.03);
						break;
					case 'deal':
						beep(cx, 520, 0.06, 'sawtooth', 0.03);
						setTimeout(
							() => beep(cx, 700, 0.05, 'square', 0.02),
							60,
						);
						break;
					case 'chip':
						beep(cx, 1500, 0.04, 'sine', 0.045);
						setTimeout(
							() => beep(cx, 1900, 0.03, 'sine', 0.03),
							35,
						);
						break;
					case 'win':
						arp([523, 659, 784]);
						break;
					case 'blackjack':
						arp([523, 659, 784, 1047], 80, 0.055);
						break;
					case 'push':
						beep(cx, 440, 0.16, 'triangle', 0.04);
						break;
					case 'lose':
						beep(cx, 300, 0.14, 'sawtooth', 0.05);
						setTimeout(
							() => beep(cx, 150, 0.2, 'sawtooth', 0.05),
							100,
						);
						break;
				}
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
