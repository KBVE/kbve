import { useEffect, useRef, useState } from 'react';
import { SHIP_SHEETS } from '../../entities/ship';
import { arpgAsset } from '../../config';

/**
 * Ship codex — live playback of the pilot rig, the ship analogue of the creature
 * codex. Pick a state (off/on/lift/idle/move/bank/leaving/entering) and a facing, and
 * a canvas plays that exact animation straight from the baked sheet (frame index =
 * dir * frames + f), independent of the running game — for auditing the art + the
 * 16-direction mapping. The sheet's column count is read from its natural size, so it
 * stays correct across re-bakes.
 */
const VIEW = 200;
type SheetKey = keyof typeof SHIP_SHEETS;
const ORDER: SheetKey[] = [
	'off',
	'on',
	'lift',
	'idle',
	'move',
	'bank',
	'leaving',
	'entering',
];

// Module-level cache so swapping state/dir doesn't re-fetch the multi-MB sheets.
const SHEETS = new Map<string, HTMLImageElement>();
function loadSheet(url: string): HTMLImageElement {
	let img = SHEETS.get(url);
	if (!img) {
		img = new Image();
		img.src = url;
		SHEETS.set(url, img);
	}
	return img;
}

export default function ShipCodex({ onClose }: { onClose: () => void }) {
	const [state, setState] = useState<SheetKey>('move');
	const [dir, setDir] = useState(0);
	const [speed, setSpeed] = useState(1);
	const [frame, setFrame] = useState(0);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);

	const s = SHIP_SHEETS[state];
	const url = arpgAsset(s.sheet);
	const dirs = Math.max(1, s.directions);

	useEffect(() => {
		if (dir > dirs - 1) setDir(0);
	}, [dirs, dir]);

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

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const img = loadSheet(url);
		const fw = s.frameWidth;
		const fh = s.frameHeight;
		const frames = Math.max(1, s.frames);
		const loop = s.play !== 'once';
		let raf = 0;
		let startMs = 0;
		let lastIdx = -1;

		const draw = (ms: number) => {
			if (!startMs) startMs = ms;
			const elapsed = ((ms - startMs) / 1000) * speed;
			let idx = Math.floor(elapsed * s.fps);
			idx = loop ? idx % frames : Math.min(idx, frames - 1);
			if (idx !== lastIdx) {
				lastIdx = idx;
				ctx.clearRect(0, 0, VIEW, VIEW);
				if (img.complete && img.naturalWidth > 0) {
					const cols = Math.max(1, Math.round(img.naturalWidth / fw));
					const frameIndex = dir * frames + idx;
					const col = frameIndex % cols;
					const row = Math.floor(frameIndex / cols);
					ctx.imageSmoothingEnabled = true;
					ctx.drawImage(
						img,
						col * fw,
						row * fh,
						fw,
						fh,
						0,
						0,
						VIEW,
						VIEW,
					);
				}
				setFrame(idx);
			}
			raf = requestAnimationFrame(draw);
		};
		raf = requestAnimationFrame(draw);
		return () => cancelAnimationFrame(raf);
	}, [url, s, dir, speed]);

	return (
		<div style={overlay} onClick={onClose}>
			<div style={panel} onClick={(e) => e.stopPropagation()}>
				<div style={header}>
					<span style={{ fontWeight: 700, letterSpacing: 1 }}>
						SHIP CODEX
					</span>
					<button style={closeBtn} onClick={onClose}>
						✕
					</button>
				</div>

				{/* state tabs */}
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
					{ORDER.map((k) => (
						<button
							key={k}
							onClick={() => setState(k)}
							style={tab(state === k)}>
							{k}
						</button>
					))}
				</div>

				<div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
					<canvas
						ref={canvasRef}
						width={VIEW}
						height={VIEW}
						style={{
							width: VIEW,
							height: VIEW,
							background:
								'repeating-conic-gradient(#1a2030 0% 25%, #151b27 0% 50%) 50% / 24px 24px',
							borderRadius: 8,
							flex: '0 0 auto',
						}}
					/>
					<div style={{ flex: 1, minWidth: 200 }}>
						<div style={meta}>
							<b>{state}</b> · {s.frames}f × {s.directions}dir ·{' '}
							{s.frameWidth}px · {s.play} · {s.fps}fps
						</div>
						<div style={meta}>
							facing <b>{dir}</b> / {dirs - 1} · frame{' '}
							<b>{frame}</b>
						</div>

						{/* direction picker */}
						{dirs > 1 && (
							<>
								<label style={lbl}>
									Facing (0=W 8=E 4=S 12=N, +22.5°/step)
								</label>
								<input
									type="range"
									min={0}
									max={dirs - 1}
									value={dir}
									onChange={(e) => setDir(+e.target.value)}
									style={{ width: '100%' }}
								/>
								<div
									style={{
										display: 'flex',
										flexWrap: 'wrap',
										gap: 3,
										marginTop: 4,
									}}>
									{Array.from({ length: dirs }, (_, d) => (
										<button
											key={d}
											onClick={() => setDir(d)}
											style={dirBtn(dir === d)}>
											{d}
										</button>
									))}
								</div>
							</>
						)}

						<label style={lbl}>Speed ×{speed.toFixed(1)}</label>
						<input
							type="range"
							min={0}
							max={3}
							step={0.1}
							value={speed}
							onChange={(e) => setSpeed(+e.target.value)}
							style={{ width: '100%' }}
						/>
					</div>
				</div>

				<div style={{ fontSize: 11, color: '#7e8aa6', marginTop: 10 }}>
					Played from the live sheet: frame index = facing × frames +
					f. A wrong facing/frame here is the bake or facing-map bug
					to fix.
				</div>
			</div>
		</div>
	);
}

const overlay: React.CSSProperties = {
	position: 'fixed',
	inset: 0,
	background: '#05070bcc',
	zIndex: 50,
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center',
};
const panel: React.CSSProperties = {
	width: 'min(720px, 94vw)',
	maxHeight: '90vh',
	overflowY: 'auto',
	background: '#10141c',
	border: '1px solid #2c3650',
	borderRadius: 10,
	padding: 16,
	color: '#cdd6e4',
	font: '13px ui-monospace, Menlo, monospace',
	boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
};
const header: React.CSSProperties = {
	display: 'flex',
	justifyContent: 'space-between',
	alignItems: 'center',
	marginBottom: 10,
};
const closeBtn: React.CSSProperties = {
	background: '#222a3d',
	color: '#cdd6e4',
	border: '1px solid #2c3650',
	borderRadius: 6,
	cursor: 'pointer',
	padding: '4px 10px',
};
const meta: React.CSSProperties = {
	fontSize: 11,
	color: '#9fb0cc',
	marginBottom: 4,
};
const lbl: React.CSSProperties = {
	display: 'block',
	fontSize: 11,
	color: '#7e8aa6',
	margin: '10px 0 2px',
};
function tab(active: boolean): React.CSSProperties {
	return {
		padding: '5px 10px',
		background: active ? '#2b62d6' : '#222a3d',
		color: active ? '#fff' : '#cdd6e4',
		border: '1px solid #2c3650',
		borderRadius: 6,
		cursor: 'pointer',
		fontSize: 12,
	};
}
function dirBtn(active: boolean): React.CSSProperties {
	return {
		width: 26,
		padding: '3px 0',
		background: active ? '#2b62d6' : '#161b27',
		color: active ? '#fff' : '#9fb0cc',
		border: '1px solid #2c3650',
		borderRadius: 4,
		cursor: 'pointer',
		fontSize: 11,
	};
}
