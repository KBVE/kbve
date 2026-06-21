import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { onHud, onHudClear, type HudState } from './systems/hud';

const PANEL_BG = 'rgba(8,9,14,0.62)';
const PANEL_BORDER = '1px solid rgba(76,90,120,0.6)';
const ACCENT = '#fcd34d';
const TEXT = '#e6ebf5';

/**
 * React HUD overlay rendered above the Phaser canvas. It is driven entirely off
 * the laser event bus (`arpg:hud`) — the scene pushes vitals + a movement
 * heading at ~15 Hz and this layer paints them. The compass needle follows the
 * character's WALK direction, not the cursor.
 */
export default function ArpgHud({ debug = false }: { debug?: boolean }) {
	const [hud, setHud] = useState<HudState | null>(null);

	useEffect(() => {
		const off = onHud(setHud);
		const offClear = onHudClear(() => setHud(null));
		return () => {
			off();
			offClear();
		};
	}, []);

	if (!hud) return null;

	return (
		<div
			style={{
				position: 'absolute',
				inset: 0,
				pointerEvents: 'none',
				fontFamily: 'monospace',
				color: TEXT,
				zIndex: 15,
			}}>
			<Vitals name={hud.name} hp={hud.hp} maxHp={hud.maxHp} />
			<MinimapSlot />
			<Compass headingDeg={hud.headingDeg} moving={hud.moving} />
			{debug && <DebugReadout fps={hud.fps} tile={hud.tile} />}
		</div>
	);
}

function Vitals({
	name,
	hp,
	maxHp,
}: {
	name: string;
	hp: number;
	maxHp: number;
}) {
	const pct = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
	return (
		<div
			style={{
				position: 'absolute',
				top: 16,
				left: 16,
				minWidth: 200,
				padding: '10px 12px',
				borderRadius: 8,
				background: PANEL_BG,
				border: PANEL_BORDER,
				backdropFilter: 'blur(2px)',
			}}>
			<div style={{ fontSize: 13, color: ACCENT, marginBottom: 6 }}>
				{name}
			</div>
			<div
				style={{
					position: 'relative',
					height: 12,
					borderRadius: 6,
					background: 'rgba(0,0,0,0.5)',
					overflow: 'hidden',
					border: '1px solid rgba(0,0,0,0.6)',
				}}>
				<div
					style={{
						position: 'absolute',
						inset: 0,
						width: `${pct * 100}%`,
						background:
							pct > 0.5
								? '#4ade80'
								: pct > 0.25
									? '#facc15'
									: '#f87171',
						transition: 'width 120ms linear',
					}}
				/>
			</div>
			<div style={{ fontSize: 11, marginTop: 4, opacity: 0.85 }}>
				{Math.round(hp)} / {Math.round(maxHp)}
			</div>
		</div>
	);
}

function MinimapSlot() {
	return (
		<div
			style={{
				position: 'absolute',
				top: 16,
				right: 16,
				width: 132,
				height: 132,
				borderRadius: 8,
				background: PANEL_BG,
				border: PANEL_BORDER,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				fontSize: 10,
				opacity: 0.55,
			}}>
			MAP
		</div>
	);
}

const COMPASS_R = 46;
const TICKS = 16;
const CARDINALS: Array<[number, string]> = [
	[0, 'N'],
	[90, 'E'],
	[180, 'S'],
	[270, 'W'],
];

/** Screen point on the compass face for an aim degree (0=N/up, CW). */
function point(deg: number, radius: number, cx: number, cy: number) {
	const rad = ((deg - 90) * Math.PI) / 180;
	return { x: cx + Math.cos(rad) * radius, y: cy + Math.sin(rad) * radius };
}

function Compass({
	headingDeg,
	moving,
}: {
	headingDeg: number;
	moving: boolean;
}) {
	const size = (COMPASS_R + 8) * 2;
	const cx = size / 2;
	const cy = size / 2;
	const tip = point(headingDeg, COMPASS_R - 3, cx, cy);

	const ticks = useMemo<ReactElement[]>(() => {
		const els: ReactElement[] = [];
		for (let i = 0; i < TICKS; i++) {
			const deg = i * (360 / TICKS);
			const major = i % 4 === 0;
			const p0 = point(deg, COMPASS_R - 6, cx, cy);
			const p1 = point(deg, COMPASS_R, cx, cy);
			els.push(
				<line
					key={i}
					x1={p0.x}
					y1={p0.y}
					x2={p1.x}
					y2={p1.y}
					stroke="#9fb3d8"
					strokeWidth={major ? 2 : 1}
					opacity={major ? 1 : 0.6}
				/>,
			);
		}
		return els;
	}, [cx, cy]);

	return (
		<div
			style={{
				position: 'absolute',
				bottom: 16,
				right: 16,
				width: size,
				height: size,
			}}>
			<svg width={size} height={size}>
				<circle
					cx={cx}
					cy={cy}
					r={COMPASS_R + 6}
					fill="rgba(8,9,14,0.55)"
				/>
				<circle
					cx={cx}
					cy={cy}
					r={COMPASS_R}
					fill="none"
					stroke="#4c5a78"
					strokeWidth={1.5}
				/>
				{ticks}
				{CARDINALS.map(([deg, label]) => {
					const p = point(deg, COMPASS_R - 16, cx, cy);
					return (
						<text
							key={label}
							x={p.x}
							y={p.y}
							fill="#9fb3d8"
							fontSize={10}
							fontFamily="monospace"
							textAnchor="middle"
							dominantBaseline="central">
							{label}
						</text>
					);
				})}
				<line
					x1={cx}
					y1={cy}
					x2={tip.x}
					y2={tip.y}
					stroke={moving ? ACCENT : '#9fb3d8'}
					strokeWidth={2.5}
					opacity={moving ? 1 : 0.55}
					style={{ transition: 'all 90ms linear' }}
				/>
				<circle
					cx={tip.x}
					cy={tip.y}
					r={3}
					fill={moving ? ACCENT : '#9fb3d8'}
					opacity={moving ? 1 : 0.55}
					style={{ transition: 'all 90ms linear' }}
				/>
			</svg>
		</div>
	);
}

function DebugReadout({
	fps,
	tile,
}: {
	fps: number;
	tile: { x: number; y: number };
}) {
	return (
		<div
			style={{
				position: 'absolute',
				bottom: 16,
				left: 16,
				padding: '6px 9px',
				borderRadius: 6,
				background: PANEL_BG,
				border: PANEL_BORDER,
				fontSize: 11,
				lineHeight: 1.5,
				opacity: 0.85,
			}}>
			<div>{fps} fps</div>
			<div>
				tile {tile.x},{tile.y}
			</div>
		</div>
	);
}
