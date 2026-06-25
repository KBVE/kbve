import { useEffect, useMemo, useRef, useState } from 'react';
import {
	CREATURES,
	CREATURE_DIRS,
	CREATURE_SHEET_COLS,
	creatureFrameRange,
	creatureSheetUrl,
	creatureStates,
	type CreatureDir,
	type CreatureState,
} from '../../entities/creatures';

const ACCENT = '#fcd34d';
const TEXT = '#e6ebf5';
const MUTED = '#9fb3d8';
const PANEL = 'rgba(18,22,32,0.96)';
const VIEW = 256;

// Tiny module-level cache so swapping states/dirs doesn't re-fetch the 4MB sheets.
const sheetCache = new Map<string, HTMLImageElement>();
function loadSheet(url: string): HTMLImageElement {
	let img = sheetCache.get(url);
	if (!img) {
		img = new Image();
		img.src = url;
		sheetCache.set(url, img);
	}
	return img;
}

/**
 * In-game bestiary: pick a creature, a state (tab) and a facing, and watch that
 * exact animation loop — rendered straight from the packed sheet metadata
 * (frame ranges + dirBlocks), independent of the running game. Built to make
 * auditing the creature art + direction mapping painless.
 */
export default function CreatureCodex({ onClose }: { onClose: () => void }) {
	const [creatureIdx, setCreatureIdx] = useState(0);
	const def = CREATURES[creatureIdx] ?? CREATURES[0];
	const states = useMemo(() => creatureStates(def), [def]);
	const [state, setState] = useState<CreatureState>(states[0] ?? 'Idle');
	const [dir, setDir] = useState<CreatureDir>('S');
	const [frame, setFrame] = useState(0);
	const [speed, setSpeed] = useState(1);

	// Keep the selected state valid when switching creatures.
	useEffect(() => {
		if (!states.includes(state)) setState(states[0] ?? 'Idle');
	}, [states, state]);

	const anim = def.anims[state];
	const range = creatureFrameRange(def, state, dir);
	const sheetUrl = creatureSheetUrl(def, state);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);

	// Drive the canvas with a single long-lived rAF loop. Deps are primitives so
	// the loop is NOT torn down on every frame-counter render — recomputing the
	// range/anim/url here keeps the animation from restarting (the earlier
	// glitch) — and the frame state only updates when the frame index changes.
	useEffect(() => {
		const canvas = canvasRef.current;
		const a = def.anims[state];
		const r = creatureFrameRange(def, state, dir);
		const url = creatureSheetUrl(def, state);
		if (!canvas || !a || !r || !url) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const img = loadSheet(url);
		const count = r.end - r.start + 1;
		const fs = def.frameSize;
		let raf = 0;
		let startMs = 0;
		let lastF = -1;

		const draw = (ms: number) => {
			if (!startMs) startMs = ms;
			const elapsed = ((ms - startMs) / 1000) * speed;
			let idx = Math.floor(elapsed * a.frameRate);
			idx = a.loop ? idx % count : Math.min(idx, count - 1);
			const f = r.start + idx;
			if (f !== lastF) {
				lastF = f;
				ctx.clearRect(0, 0, VIEW, VIEW);
				if (img.complete && img.naturalWidth > 0) {
					const cols = def.sheetCols ?? CREATURE_SHEET_COLS;
					const col = f % cols;
					const row = Math.floor(f / cols);
					ctx.imageSmoothingEnabled = true;
					ctx.drawImage(
						img,
						col * fs,
						row * fs,
						fs,
						fs,
						0,
						0,
						VIEW,
						VIEW,
					);
				}
				setFrame(f);
			}
			raf = requestAnimationFrame(draw);
		};
		raf = requestAnimationFrame(draw);
		return () => cancelAnimationFrame(raf);
	}, [def, state, dir, speed]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				onClose();
			}
		};
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	}, [onClose]);

	return (
		<div
			style={{
				position: 'absolute',
				inset: 0,
				zIndex: 40,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				background: 'rgba(6,8,12,0.78)',
				backdropFilter: 'blur(4px)',
				fontFamily: 'monospace',
				color: TEXT,
			}}
			onClick={onClose}>
			<div
				onClick={(e) => e.stopPropagation()}
				style={{
					display: 'flex',
					gap: 0,
					background: PANEL,
					border: `1px solid rgba(120,138,170,0.4)`,
					borderRadius: 10,
					overflow: 'hidden',
					boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
					minWidth: 720,
				}}>
				{/* Creature index */}
				<div
					style={{
						width: 170,
						borderRight: '1px solid rgba(120,138,170,0.25)',
						padding: '14px 10px',
						background: 'rgba(10,13,20,0.6)',
					}}>
					<div style={titleStyle}>BESTIARY</div>
					{CREATURES.map((c, i) => (
						<button
							key={c.id}
							onClick={() => setCreatureIdx(i)}
							style={listItemStyle(i === creatureIdx)}>
							{c.id}
						</button>
					))}
				</div>

				{/* Detail */}
				<div style={{ padding: '14px 18px', flex: 1 }}>
					<div
						style={{
							display: 'flex',
							justifyContent: 'space-between',
							alignItems: 'baseline',
							marginBottom: 10,
						}}>
						<div
							style={{
								fontSize: 16,
								fontWeight: 700,
								color: ACCENT,
							}}>
							{def.id}
						</div>
						<button onClick={onClose} style={closeStyle}>
							Esc ✕
						</button>
					</div>

					<div style={{ display: 'flex', gap: 16 }}>
						{/* Viewer */}
						<div>
							<div
								style={{
									width: VIEW,
									height: VIEW,
									background:
										'repeating-conic-gradient(#1b2130 0% 25%, #161b27 0% 50%) 50% / 28px 28px',
									borderRadius: 8,
									border: '1px solid rgba(120,138,170,0.3)',
								}}>
								<canvas
									ref={canvasRef}
									width={VIEW}
									height={VIEW}
								/>
							</div>
							{/* Direction picker */}
							<div
								style={{
									display: 'grid',
									gridTemplateColumns: 'repeat(4, 1fr)',
									gap: 4,
									marginTop: 8,
								}}>
								{CREATURE_DIRS.map((d) => (
									<button
										key={d}
										onClick={() => setDir(d)}
										style={dirStyle(d === dir)}>
										{d}
									</button>
								))}
							</div>
						</div>

						{/* States + info */}
						<div style={{ flex: 1, minWidth: 200 }}>
							<div style={labelStyle}>ANIMATIONS</div>
							<div
								style={{
									display: 'flex',
									flexWrap: 'wrap',
									gap: 4,
									marginBottom: 12,
								}}>
								{states.map((s) => (
									<button
										key={s}
										onClick={() => setState(s)}
										style={tabStyle(s === state)}>
										{s}
									</button>
								))}
							</div>
							<div style={labelStyle}>SPEED</div>
							<div
								style={{
									display: 'flex',
									gap: 4,
									marginBottom: 12,
								}}>
								{[0.25, 0.5, 1].map((sp) => (
									<button
										key={sp}
										onClick={() => setSpeed(sp)}
										style={tabStyle(sp === speed)}>
										{sp}×
									</button>
								))}
							</div>
							<div style={labelStyle}>FRAME DATA</div>
							<dl style={dlStyle}>
								<Row k="state" v={state} />
								<Row k="facing" v={dir} />
								<Row k="sheet" v={anim?.sheet ?? '—'} />
								<Row
									k="frames"
									v={
										range
											? `${range.start}–${range.end} (${
													range.end - range.start + 1
												})`
											: '—'
									}
								/>
								<Row k="current" v={String(frame)} />
								<Row
									k="rate"
									v={`${anim?.frameRate ?? 0} fps`}
								/>
								<Row k="loop" v={anim?.loop ? 'yes' : 'once'} />
							</dl>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function Row({ k, v }: { k: string; v: string }) {
	return (
		<div
			style={{
				display: 'flex',
				justifyContent: 'space-between',
				gap: 12,
			}}>
			<dt style={{ color: MUTED }}>{k}</dt>
			<dd style={{ margin: 0, color: TEXT }}>{v}</dd>
		</div>
	);
}

const titleStyle: React.CSSProperties = {
	fontSize: 11,
	letterSpacing: 1.5,
	color: MUTED,
	marginBottom: 10,
};
const labelStyle: React.CSSProperties = {
	fontSize: 10,
	letterSpacing: 1.5,
	color: MUTED,
	marginBottom: 6,
};
const dlStyle: React.CSSProperties = {
	margin: 0,
	fontSize: 12,
	lineHeight: 1.8,
};

function listItemStyle(active: boolean): React.CSSProperties {
	return {
		display: 'block',
		width: '100%',
		textAlign: 'left',
		padding: '7px 9px',
		marginBottom: 4,
		fontFamily: 'monospace',
		fontSize: 12,
		borderRadius: 5,
		border: 'none',
		cursor: 'pointer',
		color: active ? '#0b0e16' : TEXT,
		background: active ? ACCENT : 'rgba(76,90,120,0.25)',
	};
}
function tabStyle(active: boolean): React.CSSProperties {
	return {
		padding: '5px 9px',
		fontFamily: 'monospace',
		fontSize: 11,
		borderRadius: 5,
		border: 'none',
		cursor: 'pointer',
		color: active ? '#0b0e16' : TEXT,
		background: active ? ACCENT : 'rgba(76,90,120,0.3)',
	};
}
function dirStyle(active: boolean): React.CSSProperties {
	return {
		padding: '6px 0',
		fontFamily: 'monospace',
		fontSize: 11,
		fontWeight: 700,
		borderRadius: 5,
		border: 'none',
		cursor: 'pointer',
		color: active ? '#0b0e16' : TEXT,
		background: active ? ACCENT : 'rgba(76,90,120,0.3)',
	};
}
const closeStyle: React.CSSProperties = {
	padding: '4px 8px',
	fontFamily: 'monospace',
	fontSize: 11,
	borderRadius: 5,
	border: 'none',
	cursor: 'pointer',
	color: TEXT,
	background: 'rgba(76,90,120,0.3)',
};
