import {
	useEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type DragEvent,
	type ReactElement,
	type ReactNode,
	type RefObject,
} from 'react';
import {
	onHud,
	onHudClear,
	onInventory,
	onInventoryOpen,
	emitInventoryIntent,
	emitTooltip,
	onTooltip,
	type HudState,
	type HudMap,
	type TooltipState,
} from './systems/hud';
import type { InventoryItem } from '@kbve/laser';
import { PixelPanel } from './PixelPanel';
import { loadItemMeta, rarityColor, type ItemMeta } from './entities/itemMeta';

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
function useItemMeta(): Map<string, ItemMeta> {
	const [meta, setMeta] = useState<Map<string, ItemMeta>>(() => new Map());
	useEffect(() => {
		let alive = true;
		void loadItemMeta().then((m) => {
			if (alive) setMeta(m);
		});
		return () => {
			alive = false;
		};
	}, []);
	return meta;
}

export default function ArpgHud({ debug = false }: { debug?: boolean }) {
	const [hud, setHud] = useState<HudState | null>(null);
	const [inv, setInv] = useState<InventoryItem[]>([]);
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const scale = useHudScale(rootRef);
	const meta = useItemMeta();
	const dnd = useInventoryDnd(inv.length);

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
						<Vitals hud={hud} />
					</Anchor>
					<Anchor corner="tr" scale={scale}>
						<MinimapSlot
							map={hud.map}
							tile={hud.tile}
							headingDeg={hud.headingDeg}
						/>
					</Anchor>
					<Anchor corner="br" scale={scale}>
						<Compass
							headingDeg={hud.headingDeg}
							moving={hud.moving}
						/>
					</Anchor>
					<InventoryBar items={inv} meta={meta} dnd={dnd} />
					{open && (
						<InventoryPanel items={inv} meta={meta} dnd={dnd} />
					)}
					{debug && (
						<Anchor corner="bl" scale={scale}>
							<DebugReadout fps={hud.fps} tile={hud.tile} />
						</Anchor>
					)}
				</>
			)}
			<Tooltip />
		</div>
	);
}

/**
 * Global HUD tooltip. Any widget can summon it via `emitTooltip` (hover or touch);
 * it floats near the pointer, clamped into the viewport, and clears on
 * leave/touch-end. Single instance so widgets stay presentational.
 */
function Tooltip(): ReactElement | null {
	const [tip, setTip] = useState<TooltipState | null>(null);
	useEffect(() => onTooltip(setTip), []);
	if (!tip) return null;
	const left = Math.min(tip.x + 14, window.innerWidth - 150);
	const top = Math.min(tip.y + 14, window.innerHeight - 90);
	return (
		<div
			style={{
				position: 'fixed',
				left,
				top,
				zIndex: 40,
				pointerEvents: 'none',
			}}>
			<PixelPanel
				variant="slate"
				scale={2}
				style={{ padding: '6px 9px' }}>
				<div
					style={{
						fontSize: 11,
						fontWeight: 700,
						color: ACCENT,
						textShadow: TEXT_SHADOW,
						marginBottom: 3,
						whiteSpace: 'nowrap',
					}}>
					{tip.title}
				</div>
				{tip.lines.map((l, i) => (
					<div
						key={i}
						style={{
							fontSize: 10,
							color: i === 0 ? TEXT : MUTED,
							textShadow: TEXT_SHADOW,
							whiteSpace: 'nowrap',
						}}>
						{l}
					</div>
				))}
			</PixelPanel>
		</div>
	);
}

interface SlotDnd {
	draggable: boolean;
	onDragStart: (e: DragEvent<HTMLDivElement>) => void;
	onDragOver: (e: DragEvent<HTMLDivElement>) => void;
	onDrop: (e: DragEvent<HTMLDivElement>) => void;
}

interface InventoryDnd {
	drag: number | null;
	floorHot: boolean;
	slotProps: (i: number, hasItem: boolean) => SlotDnd;
	floorProps: {
		onDragOver: (e: DragEvent<HTMLDivElement>) => void;
		onDragLeave: () => void;
		onDrop: (e: DragEvent<HTMLDivElement>) => void;
	};
	outsideDrop: (e: DragEvent<HTMLDivElement>) => void;
	endDrag: () => void;
}

/**
 * One drag session shared across the hotbar and the open panel so a stack can be
 * dragged from either surface to either surface (reorder) or onto the floor strip
 * / released outside (drop). All mutations go out as `arpg:inventory:intent`;
 * the scene applies them (server-authoritative slot order online).
 */
function useInventoryDnd(itemCount: number): InventoryDnd {
	const [drag, setDrag] = useState<number | null>(null);
	const [floorHot, setFloorHot] = useState(false);
	const endDrag = () => {
		setDrag(null);
		setFloorHot(false);
	};
	const dropToFloor = (index: number | null) => {
		if (index != null) emitInventoryIntent({ type: 'drop', index });
		endDrag();
	};
	return {
		drag,
		floorHot,
		endDrag,
		slotProps: (i, hasItem) => ({
			draggable: hasItem,
			onDragStart: (e) => {
				setDrag(i);
				e.dataTransfer.effectAllowed = 'move';
				e.dataTransfer.setData('text/plain', String(i));
			},
			onDragOver: (e) => {
				if (drag != null) e.preventDefault();
			},
			onDrop: (e) => {
				e.preventDefault();
				if (drag != null && drag !== i) {
					const to = Math.min(i, itemCount - 1);
					emitInventoryIntent({ type: 'reorder', from: drag, to });
				}
				endDrag();
			},
		}),
		floorProps: {
			onDragOver: (e) => {
				if (drag != null) {
					e.preventDefault();
					setFloorHot(true);
				}
			},
			onDragLeave: () => setFloorHot(false),
			onDrop: (e) => {
				e.preventDefault();
				dropToFloor(drag);
			},
		},
		outsideDrop: (e) => {
			if (drag != null && e.dataTransfer.dropEffect === 'none') {
				dropToFloor(drag);
			} else {
				endDrag();
			}
		},
	};
}

/** Item glyph: the itemdb img sprite if present, else its emoji, else a stack
 * of the ref's initials — so a slot is always recognizable. */
function ItemIcon({
	meta,
	ref,
	size,
}: {
	meta?: ItemMeta;
	ref: string;
	size: number;
}): ReactElement {
	if (meta?.img) {
		return (
			<img
				src={meta.img}
				alt={meta.name ?? ref}
				width={size}
				height={size}
				style={{ imageRendering: 'pixelated', display: 'block' }}
			/>
		);
	}
	if (meta?.emoji) {
		return (
			<span style={{ fontSize: size, lineHeight: 1 }}>{meta.emoji}</span>
		);
	}
	return (
		<span
			style={{
				fontSize: size * 0.5,
				fontWeight: 700,
				color: MUTED,
				textShadow: TEXT_SHADOW,
			}}>
			{ref.slice(0, 2).toUpperCase()}
		</span>
	);
}

/**
 * Bottom-center inventory bar. Each slot shows the item icon, name + stack count
 * and its 1-9 hotkey; pressing the number (handled in the scene) uses that item.
 * Presentational — the server-authoritative inventory drives it via `arpg:inventory`.
 */
function InventoryBar({
	items,
	meta,
	dnd,
}: {
	items: InventoryItem[];
	meta: Map<string, ItemMeta>;
	dnd: InventoryDnd;
}): ReactElement | null {
	if (items.length === 0) return null;
	const slots = items.slice(0, 9);
	return (
		<div
			onDragEnd={dnd.endDrag}
			style={{
				position: 'absolute',
				bottom: 14,
				left: '50%',
				transform: 'translateX(-50%)',
				display: 'flex',
				gap: 6,
			}}>
			{slots.map((it, i) => {
				const m = meta.get(it.ref);
				const slot = dnd.slotProps(i, true);
				return (
					<PixelPanel
						key={it.ref}
						variant="slate"
						scale={2}
						onClick={() =>
							emitInventoryIntent({ type: 'use', index: i })
						}
						title={`Use ${m?.name ?? it.ref} · drag to organize`}
						draggable={slot.draggable}
						onDragStart={slot.onDragStart}
						onDragOver={slot.onDragOver}
						onDrop={slot.onDrop}
						style={{
							minWidth: 58,
							padding: '5px 8px 7px',
							textAlign: 'center',
							pointerEvents: 'auto',
							cursor: 'grab',
							opacity: dnd.drag === i ? 0.4 : 1,
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
								height: 22,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
							}}>
							<ItemIcon meta={m} ref={it.ref} size={20} />
						</div>
						<div
							style={{
								fontSize: 9,
								color: rarityColor(m?.rarity),
								textShadow: TEXT_SHADOW,
								whiteSpace: 'nowrap',
								overflow: 'hidden',
								textOverflow: 'ellipsis',
								maxWidth: 58,
							}}>
							{m?.name ?? it.ref}
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
				);
			})}
		</div>
	);
}

const GRID_COLS = 6;
const MIN_SLOTS = 24;

/**
 * Full inventory window, toggled with the I key (Escape closes). A fixed grid of
 * slots: items fill from the top-left in inventory order. Drag a slot onto
 * another to reorder; drag a slot onto the floor strip (or release outside any
 * slot) to drop the stack to the ground; double-click a slot to use it. The
 * hotbar stays visible underneath. Driven by `arpg:inventory`; mutations are
 * dispatched as `arpg:inventory:intent` for the scene to apply.
 */
function InventoryPanel({
	items,
	meta,
	dnd,
}: {
	items: InventoryItem[];
	meta: Map<string, ItemMeta>;
	dnd: InventoryDnd;
}): ReactElement {
	const { drag, floorHot } = dnd;
	const slotCount = Math.max(
		MIN_SLOTS,
		Math.ceil(items.length / GRID_COLS) * GRID_COLS,
	);

	return (
		<div
			onDragEnd={dnd.outsideDrop}
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
				style={{ width: 380, padding: '14px 16px 18px' }}>
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
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
						gap: 6,
					}}>
					{Array.from({ length: slotCount }, (_, i) => {
						const it = items[i];
						const m = it ? meta.get(it.ref) : undefined;
						const isDragging = drag === i;
						const slot = dnd.slotProps(i, !!it);
						return (
							<div
								key={i}
								draggable={slot.draggable}
								title={it ? (m?.name ?? it.ref) : undefined}
								onDragStart={slot.onDragStart}
								onDragOver={slot.onDragOver}
								onDrop={slot.onDrop}
								onDoubleClick={() => {
									if (it)
										emitInventoryIntent({
											type: 'use',
											index: i,
										});
								}}
								style={{
									position: 'relative',
									minHeight: 64,
									padding: '6px 4px',
									borderRadius: 4,
									background: it
										? 'rgba(0,0,0,0.35)'
										: 'rgba(0,0,0,0.18)',
									border: `1px solid ${
										it
											? `${rarityColor(m?.rarity)}55`
											: 'rgba(120,140,180,0.18)'
									}`,
									textAlign: 'center',
									cursor: it ? 'grab' : 'default',
									opacity: isDragging ? 0.4 : 1,
								}}>
								{it && i < 9 && (
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
								{it && (
									<>
										<div
											style={{
												height: 24,
												display: 'flex',
												alignItems: 'center',
												justifyContent: 'center',
												marginTop: 4,
											}}>
											<ItemIcon
												meta={m}
												ref={it.ref}
												size={22}
											/>
										</div>
										<div
											style={{
												fontSize: 8,
												color: rarityColor(m?.rarity),
												textShadow: TEXT_SHADOW,
												marginTop: 3,
												wordBreak: 'break-word',
											}}>
											{m?.name ?? it.ref}
										</div>
										<div
											style={{
												fontSize: 10,
												fontWeight: 700,
												color: ACCENT,
												textShadow: TEXT_SHADOW,
											}}>
											×{it.count}
										</div>
									</>
								)}
							</div>
						);
					})}
				</div>

				<div
					onDragOver={dnd.floorProps.onDragOver}
					onDragLeave={dnd.floorProps.onDragLeave}
					onDrop={dnd.floorProps.onDrop}
					style={{
						marginTop: 10,
						padding: '8px 0',
						borderRadius: 4,
						border: `1px dashed ${floorHot ? '#f87171' : 'rgba(160,120,120,0.5)'}`,
						background: floorHot
							? 'rgba(248,113,113,0.18)'
							: 'rgba(0,0,0,0.2)',
						color: floorHot ? '#fca5a5' : MUTED,
						textShadow: TEXT_SHADOW,
						textAlign: 'center',
						fontSize: 10,
					}}>
					🗑 Drag here to drop to the floor
				</div>

				<div
					style={{
						marginTop: 10,
						fontSize: 9,
						color: MUTED,
						textShadow: TEXT_SHADOW,
						textAlign: 'center',
						opacity: 0.8,
					}}>
					{items.length === 0
						? 'Empty — walk over loot to pick it up.'
						: 'Drag to reorder · double-click to use · 1-9 hotkeys'}
				</div>
			</PixelPanel>
		</div>
	);
}

interface OrbStat {
	label: string;
	name: string;
	cur: number;
	max: number;
	/** [bright, mid, deep] fluid gradient stops. */
	fluid: [string, string, string];
}

/**
 * Diablo-style vitals: a name plate over a 2×2 cluster of glass orbs — HP/MP/EP/SP
 * — each a globe with a fluid level that rises and falls with the stat percentage.
 * HP is server-authoritative; MP/EP/SP are placeholder-full until their resource
 * pools are wired through the ECS + netSync (they read off `hud` already so it's a
 * one-line swap once the server sends them).
 */
function Vitals({ hud }: { hud: HudState }) {
	const phase = useWavePhase();
	const orbs: OrbStat[] = [
		{
			label: 'HP',
			name: 'Health',
			cur: hud.hp,
			max: hud.maxHp,
			fluid: ['#fb7185', '#ef4444', '#7f1d1d'],
		},
		{
			label: 'MP',
			name: 'Mana',
			cur: hud.mp,
			max: hud.maxMp,
			fluid: ['#60a5fa', '#3b82f6', '#1e3a8a'],
		},
		{
			label: 'EP',
			name: 'Energy',
			cur: hud.ep,
			max: hud.maxEp,
			fluid: ['#fde047', '#eab308', '#854d0e'],
		},
		{
			label: 'SP',
			name: 'Stamina',
			cur: hud.sp,
			max: hud.maxSp,
			fluid: ['#4ade80', '#22c55e', '#14532d'],
		},
	];
	return (
		<PixelPanel variant="gold" scale={2} style={{ padding: '7px 8px' }}>
			<div
				style={{
					display: 'flex',
					flexDirection: 'row',
					gap: 6,
				}}>
				{orbs.map((o, i) => (
					<StatOrb key={o.label} phase={phase + i * 1.7} {...o} />
				))}
			</div>
		</PixelPanel>
	);
}

const ORB_PX = 54;
const WAVE_AMP = 2.2;

/**
 * Shared liquid-surface clock. One rAF loop advances a phase all orbs read from
 * (offset per orb) so their waves ripple out of sync without four timers. Pauses
 * when the tab is hidden via the browser throttling rAF.
 */
function useWavePhase(): number {
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

/** SVG path of a wavy fluid surface filling the orb up to `level` (y of the
 * resting waterline), with two summed sines for an organic ripple. */
function fluidPath(level: number, phase: number): string {
	const steps = 10;
	let d = `M 0 ${ORB_PX}`;
	for (let i = 0; i <= steps; i++) {
		const x = (i / steps) * ORB_PX;
		const y =
			level +
			Math.sin(phase + (i / steps) * Math.PI * 2) * WAVE_AMP +
			Math.sin(phase * 1.6 + (i / steps) * Math.PI * 4) *
				(WAVE_AMP * 0.4);
		d += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
	}
	d += ` L ${ORB_PX} ${ORB_PX} Z`;
	return d;
}

/**
 * A single glass globe. The fluid is a clipped body whose wavy top surface ripples
 * via a shared rAF phase and rises/falls with the stat percentage; over it sit a
 * glossy specular highlight, an inner rim shadow for depth, and a glass rim stroke.
 */
function StatOrb({
	label,
	name,
	cur,
	max,
	fluid,
	phase,
}: OrbStat & { phase: number }) {
	const pct = max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0;
	const r = ORB_PX / 2;
	const level = ORB_PX * (1 - pct);
	const clipId = useMemo(() => `orb-${fluid[1].replace('#', '')}`, [fluid]);
	const path = pct > 0 ? fluidPath(level, phase) : '';

	const show = (e: { clientX: number; clientY: number }) => {
		emitTooltip({
			x: e.clientX,
			y: e.clientY,
			title: name,
			lines: [
				`${Math.round(cur)} / ${Math.round(max)}`,
				`${Math.round(pct * 100)}%`,
			],
		});
	};
	const hide = () => emitTooltip(null);

	return (
		<svg
			width={ORB_PX}
			height={ORB_PX}
			viewBox={`0 0 ${ORB_PX} ${ORB_PX}`}
			onPointerEnter={show}
			onPointerMove={show}
			onPointerLeave={hide}
			onTouchStart={(e) => {
				const t = e.touches[0];
				if (t) show({ clientX: t.clientX, clientY: t.clientY });
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
				y={r - 2}
				fill={TEXT}
				fontSize={10}
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
			<text
				x={r}
				y={r + 10}
				fill={MUTED}
				fontSize={8}
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
		</svg>
	);
}

const MINIMAP_PX = 128;
const FLOOR_COLOR = '#5a6c8c';
const ROOM_GLOW = '#7e93b8';

/**
 * Top-down dungeon minimap: paints the floor bitset (rooms + the carved
 * corridor paths) as lit cells over a dark void, with the player pinned at the
 * center and a heading wedge showing walk direction. Canvas keeps the per-cell
 * fill cheap at 15 Hz.
 */
function MinimapSlot({
	map,
	tile,
	headingDeg,
}: {
	map: HudMap;
	tile: { x: number; y: number };
	headingDeg: number;
}) {
	const ref = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = ref.current;
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const { size, cells, origin } = map;
		const cell = MINIMAP_PX / size;

		ctx.clearRect(0, 0, MINIMAP_PX, MINIMAP_PX);
		ctx.fillStyle = 'rgba(10,13,20,0.55)';
		ctx.fillRect(0, 0, MINIMAP_PX, MINIMAP_PX);

		ctx.fillStyle = FLOOR_COLOR;
		for (let j = 0; j < size; j++) {
			for (let i = 0; i < size; i++) {
				if (!cells[j * size + i]) continue;
				ctx.fillRect(
					Math.floor(i * cell),
					Math.floor(j * cell),
					Math.ceil(cell),
					Math.ceil(cell),
				);
			}
		}

		// Player marker at its true cell within the window (center, but use the
		// real offset so it tracks if the window ever lags a step).
		const pcx = (tile.x - origin.x + 0.5) * cell;
		const pcy = (tile.y - origin.y + 0.5) * cell;

		ctx.save();
		ctx.translate(pcx, pcy);
		ctx.rotate(((headingDeg - 90) * Math.PI) / 180);
		ctx.fillStyle = ROOM_GLOW;
		ctx.beginPath();
		ctx.moveTo(7, 0);
		ctx.lineTo(-4, -4);
		ctx.lineTo(-4, 4);
		ctx.closePath();
		ctx.fill();
		ctx.restore();

		ctx.fillStyle = '#fcd34d';
		ctx.beginPath();
		ctx.arc(pcx, pcy, 2.5, 0, Math.PI * 2);
		ctx.fill();
	}, [map, tile.x, tile.y, headingDeg]);

	return (
		<PixelPanel variant="slate" scale={2} style={{ lineHeight: 0 }}>
			<canvas
				ref={ref}
				width={MINIMAP_PX}
				height={MINIMAP_PX}
				style={{
					display: 'block',
					imageRendering: 'pixelated',
					margin: -6,
				}}
			/>
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
