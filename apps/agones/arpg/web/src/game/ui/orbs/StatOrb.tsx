import { useEffect, useMemo, useState, memo } from 'react';
import { useTranslation } from '@kbve/laser';
import { emitTooltip } from '../../systems/hud';

export interface OrbStat {
	key: 'hp' | 'mp' | 'ep' | 'sp';
	cur: number;
	max: number;
	fluid: [string, string, string];
}

const TEXT = '#e6ebf5';
const MUTED = '#9fb3d8';

const WAVE_AMP = 2.2;

export function useWavePhase(): number {
	const [phase, setPhase] = useState(0);
	useEffect(() => {
		let raf = 0;
		let start = 0;
		const tick = (t: number) => {
			if (!start) start = t;
			setPhase(((t - start) / 1000) * 2.2);
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, []);
	return phase;
}

function fluidPath(level: number, phase: number, size: number): string {
	const steps = 10;
	let d = `M 0 ${size}`;
	for (let i = 0; i <= steps; i++) {
		const x = (i / steps) * size;
		const y =
			level +
			Math.sin(phase + (i / steps) * Math.PI * 2) * WAVE_AMP +
			Math.sin(phase * 1.6 + (i / steps) * Math.PI * 4) *
				(WAVE_AMP * 0.4);
		d += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
	}
	d += ` L ${size} ${size} Z`;
	return d;
}

const StatOrbInner = ({
	stat,
	phase,
	size = 72,
}: {
	stat: OrbStat;
	phase: number;
	size?: number;
}) => {
	const { t } = useTranslation();
	const { key, cur, max, fluid } = stat;
	const pct = max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0;
	const r = size / 2;
	const level = size * (1 - pct);
	const clipId = useMemo(() => `orb-${key}`, [key]);
	const path = pct > 0 ? fluidPath(level, phase, size) : '';
	const label = t(`arpg.hud.${key}.label`);
	const name = t(`arpg.hud.${key}.name`);

	const show = (e: { clientX: number; clientY: number }) => {
		emitTooltip({
			x: e.clientX,
			y: e.clientY,
			title: name,
			lines: [
				t('arpg.hud.orb.value', {
					cur: Math.round(cur),
					max: Math.round(max),
				}),
				t('arpg.hud.orb.pct', { pct: Math.round(pct * 100) }),
			],
		});
	};
	const hide = () => emitTooltip(null);

	return (
		<svg
			width={size}
			height={size}
			viewBox={`0 0 ${size} ${size}`}
			onPointerEnter={show}
			onPointerMove={show}
			onPointerLeave={hide}
			onTouchStart={(e) => {
				const tch = e.touches[0];
				if (tch) show({ clientX: tch.clientX, clientY: tch.clientY });
			}}
			onTouchEnd={hide}
			style={{
				display: 'block',
				overflow: 'visible',
				pointerEvents: 'auto',
				cursor: 'pointer',
			}}>
			<defs>
				<clipPath id={clipId}>
					<circle cx={r} cy={r} r={r - 1.5} />
				</clipPath>
				<radialGradient id={`${clipId}-g`} cx="50%" cy="35%" r="75%">
					<stop offset="0%" stopColor={fluid[0]} />
					<stop offset="55%" stopColor={fluid[1]} />
					<stop offset="100%" stopColor={fluid[2]} />
				</radialGradient>
			</defs>
			<circle cx={r} cy={r} r={r - 1.5} fill="rgba(6,9,16,0.78)" />
			<g clipPath={`url(#${clipId})`}>
				{pct > 0 && (
					<>
						<path d={path} fill={`url(#${clipId}-g)`} />
						<path
							d={path}
							fill="none"
							stroke={fluid[0]}
							strokeWidth={1.5}
							opacity={0.85}
						/>
					</>
				)}
				<ellipse
					cx={r * 0.68}
					cy={r * 0.5}
					rx={r * 0.5}
					ry={r * 0.3}
					fill="rgba(255,255,255,0.32)"
				/>
				<circle
					cx={r}
					cy={r}
					r={r - 1.5}
					fill="none"
					stroke="rgba(0,0,0,0.55)"
					strokeWidth={3}
				/>
			</g>
			<circle
				cx={r}
				cy={r}
				r={r - 1.5}
				fill="none"
				stroke="rgba(180,200,230,0.55)"
				strokeWidth={1.5}
			/>
			<text
				x={r}
				y={r + size * 0.28}
				fill={MUTED}
				fontSize={size * 0.13}
				fontFamily="monospace"
				textAnchor="middle"
				dominantBaseline="central"
				style={{
					paintOrder: 'stroke',
					stroke: 'rgba(0,0,0,0.85)',
					strokeWidth: 2,
				}}>
				{Math.round(cur)}
			</text>
			<text
				x={r}
				y={size * 0.2}
				fill={TEXT}
				fontSize={size * 0.15}
				fontWeight={700}
				fontFamily="monospace"
				textAnchor="middle"
				dominantBaseline="central"
				style={{
					paintOrder: 'stroke',
					stroke: 'rgba(0,0,0,0.85)',
					strokeWidth: 2.5,
				}}>
				{label}
			</text>
		</svg>
	);
};

/**
 * Memoized StatOrb — skips re-render if stat values + phase unchanged.
 * Prevents 240 React renders/sec (4 orbs × 60fps RAF).
 */
export const StatOrb = memo(
	StatOrbInner,
	(prev, next) =>
		prev.stat.cur === next.stat.cur &&
		prev.stat.max === next.stat.max &&
		prev.stat.key === next.stat.key &&
		prev.phase === next.phase &&
		prev.size === next.size,
);
