import {
	useEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type ReactElement,
	type ReactNode,
	type RefObject,
} from 'react';
import {
	onHud,
	onHudClear,
	onInventory,
	onInventoryOpen,
	type HudState,
} from './systems/hud';
import type { InventoryItem } from '@kbve/laser';
import { PixelPanel } from './PixelPanel';

const ACCENT = '#fcd34d';
const TEXT = '#e6ebf5';
const MUTED = '#9fb3d8';
const TEXT_SHADOW = '0 1px 2px rgba(0,0,0,0.9)';

// HUD panels are authored at this reference viewport width and scaled to fit
// the actual container, so the data stays in-frame on any window size.
const REF_WIDTH = 960;
const MIN_SCALE = 0.6;
const MAX_SCALE = 1.35;

/**
 * Uniform HUD scale derived from the overlay's own width vs the reference width.
 * One ResizeObserver feeds every corner anchor so panels shrink on a narrow
 * embed and grow on a wide one without ever clipping past the viewport.
 */
function useHudScale(ref: RefObject<HTMLDivElement | null>): number {
	const [scale, setScale] = useState(1);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const measure = () => {
			const w = el.clientWidth || REF_WIDTH;
			const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, w / REF_WIDTH));
			setScale(s);
		};
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		return () => ro.disconnect();
	}, [ref]);
	return scale;
}

type Corner = 'tl' | 'tr' | 'bl' | 'br';

const CORNER_POS: Record<Corner, CSSProperties> = {
	tl: { top: 0, left: 0, transformOrigin: 'top left' },
	tr: { top: 0, right: 0, transformOrigin: 'top right' },
	bl: { bottom: 0, left: 0, transformOrigin: 'bottom left' },
	br: { bottom: 0, right: 0, transformOrigin: 'bottom right' },
};

/** A corner-anchored, uniformly-scaled slot. Scaling toward the anchored corner
 * keeps the panel pinned to the viewport edge at every size. */
function Anchor({
	corner,
	scale,
	margin = 14,
	children,
}: {
	corner: Corner;
	scale: number;
	margin?: number;
	children: ReactNode;
}) {
	return (
		<div
			style={{
				position: 'absolute',
				margin,
				transform: `scale(${scale})`,
				...CORNER_POS[corner],
			}}>
			{children}
		</div>
	);
}

/**
 * React HUD overlay rendered above the Phaser canvas. Driven entirely off the
 * laser event bus (`arpg:hud`) — the scene pushes vitals + a movement heading
 * at ~15 Hz and this layer paints them. The compass needle follows the
 * character's WALK direction, not the cursor. Panels use the transparent
 * 9-slice PixelPanel family so the scene shows through.
 */
export default function ArpgHud({ debug = false }: { debug?: boolean }) {
	const [hud, setHud] = useState<HudState | null>(null);
	const [inv, setInv] = useState<InventoryItem[]>([]);
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const scale = useHudScale(rootRef);

	useEffect(() => {
		const off = onHud(setHud);
		const offInv = onInventory(setInv);
		const offOpen = onInventoryOpen(setOpen);
		const offClear = onHudClear(() => {
			setHud(null);
			setInv([]);
			setOpen(false);
		});
		return () => {
			off();
			offInv();
			offOpen();
			offClear();
		};
	}, []);

	return (
		<div
			ref={rootRef}
			style={{
				position: 'absolute',
				inset: 0,
				pointerEvents: 'none',
				fontFamily: 'monospace',
				color: TEXT,
				zIndex: 15,
				overflow: 'hidden',
			}}>
			{hud && (
				<>
					<Anchor corner="tl" scale={scale}>
						<Vitals name={hud.name} hp={hud.hp} maxHp={hud.maxHp} />
					</Anchor>
					<Anchor corner="tr" scale={scale}>
						<MinimapSlot />
					</Anchor>
					<Anchor corner="br" scale={scale}>
						<Compass
							headingDeg={hud.headingDeg}
							moving={hud.moving}
						/>
					</Anchor>
					<InventoryBar items={inv} />
					{open && <InventoryPanel items={inv} />}
					{debug && (
						<Anchor corner="bl" scale={scale}>
							<DebugReadout fps={hud.fps} tile={hud.tile} />
						</Anchor>
					)}
				</>
			)}
		</div>
	);
}

/**
 * Bottom-center inventory bar. Each slot shows the item ref + stack count and its
 * 1-9 hotkey; pressing the number (handled in the scene) uses that item. Purely
 * presentational — the server-authoritative inventory drives it via `arpg:inventory`.
 */
function InventoryBar({
	items,
}: {
	items: InventoryItem[];
}): ReactElement | null {
	if (items.length === 0) return null;
	const slots = items.slice(0, 9);
	return (
		<div
			style={{
				position: 'absolute',
				bottom: 14,
				left: '50%',
				transform: 'translateX(-50%)',
				display: 'flex',
				gap: 6,
			}}>
			{slots.map((it, i) => (
				<PixelPanel
					key={it.ref}
					variant="slate"
					scale={2}
					style={{
						minWidth: 58,
						padding: '5px 8px 7px',
						textAlign: 'center',
					}}>
					<div
						style={{
							fontSize: 9,
							color: ACCENT,
							textShadow: TEXT_SHADOW,
							opacity: 0.85,
						}}>
						{i + 1}
					</div>
					<div
						style={{
							fontSize: 10,
							color: TEXT,
							textShadow: TEXT_SHADOW,
						}}>
						{it.ref}
					</div>
					<div
						style={{
							fontSize: 11,
							fontWeight: 700,
							color: ACCENT,
							textShadow: TEXT_SHADOW,
						}}>
						×{it.count}
					</div>
				</PixelPanel>
			))}
		</div>
	);
}

/**
 * Full inventory window, toggled with the I key (Escape closes). Centered grid of
 * every held item; the first nine show their 1-9 hotkey. The hotbar stays visible
 * underneath. Server-authoritative via `arpg:inventory`.
 */
function InventoryPanel({ items }: { items: InventoryItem[] }): ReactElement {
	return (
		<div
			style={{
				position: 'absolute',
				inset: 0,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				background: 'rgba(2,3,6,0.45)',
				pointerEvents: 'auto',
			}}>
			<PixelPanel
				variant="gold"
				scale={3}
				style={{ width: 360, padding: '14px 16px 18px' }}>
				<div
					style={{
						fontSize: 14,
						fontWeight: 700,
						color: ACCENT,
						textShadow: TEXT_SHADOW,
						letterSpacing: 0.5,
						marginBottom: 12,
						textAlign: 'center',
					}}>
					Inventory
				</div>
				{items.length === 0 ? (
					<div
						style={{
							color: MUTED,
							textShadow: TEXT_SHADOW,
							textAlign: 'center',
							fontSize: 11,
							padding: '18px 0',
						}}>
						Empty — walk over loot to pick it up.
					</div>
				) : (
					<div
						style={{
							display: 'grid',
							gridTemplateColumns: 'repeat(4, 1fr)',
							gap: 8,
						}}>
						{items.map((it, i) => (
							<div
								key={it.ref}
								style={{
									position: 'relative',
									minHeight: 54,
									padding: '8px 4px',
									borderRadius: 4,
									background: 'rgba(0,0,0,0.35)',
									border: '1px solid rgba(120,140,180,0.35)',
									textAlign: 'center',
								}}>
								{i < 9 && (
									<span
										style={{
											position: 'absolute',
											top: 2,
											left: 4,
											fontSize: 9,
											color: ACCENT,
											textShadow: TEXT_SHADOW,
											opacity: 0.85,
										}}>
										{i + 1}
									</span>
								)}
								<div
									style={{
										fontSize: 10,
										color: TEXT,
										textShadow: TEXT_SHADOW,
										marginTop: 6,
										wordBreak: 'break-word',
									}}>
									{it.ref}
								</div>
								<div
									style={{
										fontSize: 11,
										fontWeight: 700,
										color: ACCENT,
										textShadow: TEXT_SHADOW,
									}}>
									×{it.count}
								</div>
							</div>
						))}
					</div>
				)}
				<div
					style={{
						marginTop: 12,
						fontSize: 9,
						color: MUTED,
						textShadow: TEXT_SHADOW,
						textAlign: 'center',
						opacity: 0.8,
					}}>
					I / Esc to close · 1-9 to use
				</div>
			</PixelPanel>
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
	const barColor = pct > 0.5 ? '#4ade80' : pct > 0.25 ? '#facc15' : '#f87171';
	return (
		<PixelPanel
			variant="gold"
			scale={2}
			style={{
				width: 212,
				padding: '8px 11px 10px',
			}}>
			<div
				style={{
					display: 'flex',
					alignItems: 'baseline',
					justifyContent: 'space-between',
					marginBottom: 7,
				}}>
				<span
					style={{
						fontSize: 13,
						fontWeight: 700,
						color: ACCENT,
						textShadow: TEXT_SHADOW,
						letterSpacing: 0.4,
					}}>
					{name}
				</span>
				<span
					style={{
						fontSize: 10,
						color: MUTED,
						textShadow: TEXT_SHADOW,
					}}>
					{Math.round(hp)}/{Math.round(maxHp)}
				</span>
			</div>
			<div
				style={{
					position: 'relative',
					height: 10,
					borderRadius: 5,
					background: 'rgba(0,0,0,0.55)',
					overflow: 'hidden',
					boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.7)',
				}}>
				<div
					style={{
						position: 'absolute',
						inset: 0,
						width: `${pct * 100}%`,
						background: `linear-gradient(180deg, ${barColor}, ${barColor}cc)`,
						boxShadow: `0 0 6px ${barColor}88`,
						transition: 'width 140ms ease-out, background 200ms',
					}}
				/>
			</div>
		</PixelPanel>
	);
}

function MinimapSlot() {
	return (
		<PixelPanel
			variant="slate"
			scale={2}
			style={{
				width: 132,
				height: 132,
			}}>
			<div
				style={{
					width: '100%',
					height: '100%',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					fontSize: 9,
					letterSpacing: 2,
					color: MUTED,
					opacity: 0.5,
					textShadow: TEXT_SHADOW,
				}}>
				MAP
			</div>
		</PixelPanel>
	);
}

const COMPASS_R = 44;
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
	const pad = 10;
	const size = (COMPASS_R + pad) * 2;
	const cx = size / 2;
	const cy = size / 2;
	const tip = point(headingDeg, COMPASS_R - 4, cx, cy);
	const needleColor = moving ? ACCENT : MUTED;
	const needleAlpha = moving ? 1 : 0.5;

	const ticks = useMemo<ReactElement[]>(() => {
		const els: ReactElement[] = [];
		for (let i = 0; i < TICKS; i++) {
			const deg = i * (360 / TICKS);
			const major = i % 4 === 0;
			const p0 = point(deg, COMPASS_R - (major ? 8 : 5), cx, cy);
			const p1 = point(deg, COMPASS_R, cx, cy);
			els.push(
				<line
					key={i}
					x1={p0.x}
					y1={p0.y}
					x2={p1.x}
					y2={p1.y}
					stroke={major ? '#c3d2ee' : MUTED}
					strokeWidth={major ? 2 : 1}
					opacity={major ? 0.95 : 0.5}
				/>,
			);
		}
		return els;
	}, [cx, cy]);

	return (
		<PixelPanel
			variant="frost"
			scale={2}
			style={{
				lineHeight: 0,
			}}>
			<svg width={size} height={size} style={{ display: 'block' }}>
				<circle
					cx={cx}
					cy={cy}
					r={COMPASS_R}
					fill="rgba(12,16,26,0.45)"
				/>
				{ticks}
				{CARDINALS.map(([deg, label]) => {
					const p = point(deg, COMPASS_R - 17, cx, cy);
					const north = label === 'N';
					return (
						<text
							key={label}
							x={p.x}
							y={p.y}
							fill={north ? '#f87171' : MUTED}
							fontSize={north ? 12 : 10}
							fontWeight={north ? 700 : 400}
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
					stroke={needleColor}
					strokeWidth={3}
					strokeLinecap="round"
					opacity={needleAlpha}
					style={{ transition: 'all 90ms linear' }}
				/>
				<circle
					cx={tip.x}
					cy={tip.y}
					r={3.5}
					fill={needleColor}
					opacity={needleAlpha}
					style={{ transition: 'all 90ms linear' }}
				/>
				<circle
					cx={cx}
					cy={cy}
					r={4}
					fill="#0c101a"
					stroke={needleColor}
					strokeWidth={1.5}
					opacity={0.9}
				/>
			</svg>
		</PixelPanel>
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
		<PixelPanel
			variant="slate"
			scale={2}
			style={{
				padding: '5px 9px',
				fontSize: 10,
				lineHeight: 1.6,
				color: MUTED,
				textShadow: TEXT_SHADOW,
			}}>
			<div>{fps} fps</div>
			<div>
				{tile.x},{tile.y}
			</div>
		</PixelPanel>
	);
}
