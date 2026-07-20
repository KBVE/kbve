import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { useMonorepoGraph } from './useMonorepoGraph';
import TieredGraphScene, {
	type ColorMode,
	type HoverInfo,
} from './TieredGraphScene';

interface Props {
	base?: string;
}

interface PickedDir {
	id: string;
	label: string;
	n: number;
	files: number;
}

/**
 * Tiered monorepo dependency explorer. Loads a tiny directory overview on
 * mount and lazily drills into per-directory files and symbols as you zoom —
 * a filesystem-hierarchy level-of-detail that scales to the full ~67k-symbol
 * graph. Toggle recolors between directory and Leiden-community palettes.
 */
export default function MonorepoGraphExplorer({ base }: Props) {
	const { overview, loading, error, loadDir, getChunk } =
		useMonorepoGraph(base);
	const [colorMode, setColorMode] = useState<ColorMode>('dir');
	const [hover, setHover] = useState<HoverInfo | null>(null);
	const [picked, setPicked] = useState<PickedDir | null>(null);

	return (
		<div className="mgx" data-monorepo-graph>
			{loading && <div className="mgx__msg">Loading monorepo graph…</div>}
			{error && (
				<div className="mgx__msg mgx__msg--err">
					Failed to load graph: {error}
				</div>
			)}
			{overview && (
				<>
					<Canvas
						orthographic
						camera={{
							position: [0, 0, 100],
							zoom: 1,
							near: 0.1,
							far: 1000,
						}}
						dpr={[1, 2]}
					>
						<color attach="background" args={['#0a0e16']} />
						<TieredGraphScene
							overview={overview}
							loadDir={loadDir}
							getChunk={getChunk}
							colorMode={colorMode}
							onHover={setHover}
							onPickDir={setPicked}
						/>
					</Canvas>

					<div className="mgx__legend">
						<strong>{overview.meta.dirs}</strong> dirs ·{' '}
						<strong>
							{overview.meta.files.toLocaleString()}
						</strong>{' '}
						files ·{' '}
						<strong>
							{overview.meta.symbols.toLocaleString()}
						</strong>{' '}
						symbols — scroll to zoom into a directory, drag to pan
					</div>

					<div className="mgx__controls">
						<button
							type="button"
							className={
								colorMode === 'dir' ? 'is-active' : ''
							}
							onClick={() => setColorMode('dir')}
						>
							Color: directory
						</button>
						<button
							type="button"
							className={
								colorMode === 'community' ? 'is-active' : ''
							}
							onClick={() => setColorMode('community')}
						>
							Color: community
						</button>
					</div>

					{picked && (
						<div className="mgx__panel">
							<div className="mgx__panel-title">
								{picked.label}
							</div>
							<div className="mgx__panel-sub">
								{picked.n.toLocaleString()} symbols ·{' '}
								{picked.files} files
							</div>
							<button
								type="button"
								onClick={() => setPicked(null)}
							>
								dismiss
							</button>
						</div>
					)}

					{hover && (
						<div
							className="mgx__tooltip"
							style={{
								left: Math.min(hover.x + 14, window.innerWidth - 260),
								top: hover.y + 14,
							}}
						>
							<span className={`mgx__kind mgx__kind--${hover.kind}`}>
								{hover.kind}
							</span>
							<span className="mgx__tip-label">{hover.label}</span>
							<span className="mgx__tip-sub">{hover.sub}</span>
						</div>
					)}
				</>
			)}

			<style>{`
				.mgx {
					position: relative;
					width: 100%;
					height: 100%;
					min-height: 520px;
					background: #0a0e16;
					border-radius: 12px;
					overflow: hidden;
				}
				.mgx__msg {
					position: absolute;
					inset: 0;
					display: flex;
					align-items: center;
					justify-content: center;
					color: #94a3b8;
					font-size: 0.9rem;
				}
				.mgx__msg--err { color: #f87171; }
				.mgx__legend {
					position: absolute;
					left: 12px;
					bottom: 12px;
					padding: 6px 10px;
					border-radius: 8px;
					background: rgba(12, 18, 30, 0.72);
					color: #cbd5e1;
					font-size: 0.72rem;
					backdrop-filter: blur(6px);
					pointer-events: none;
				}
				.mgx__legend strong { color: #e2e8f0; }
				.mgx__controls {
					position: absolute;
					right: 12px;
					top: 12px;
					display: flex;
					gap: 6px;
				}
				.mgx__controls button {
					padding: 5px 10px;
					border-radius: 8px;
					border: 1px solid rgba(148, 163, 184, 0.3);
					background: rgba(12, 18, 30, 0.72);
					color: #cbd5e1;
					font-size: 0.72rem;
					cursor: pointer;
					backdrop-filter: blur(6px);
				}
				.mgx__controls button.is-active {
					border-color: #38bdf8;
					color: #e0f2fe;
				}
				.mgx__panel {
					position: absolute;
					left: 12px;
					top: 12px;
					padding: 10px 12px;
					border-radius: 10px;
					background: rgba(12, 18, 30, 0.82);
					border: 1px solid rgba(148, 163, 184, 0.25);
					color: #e2e8f0;
					font-size: 0.78rem;
					backdrop-filter: blur(6px);
					max-width: 260px;
				}
				.mgx__panel-title { font-weight: 600; }
				.mgx__panel-sub {
					color: #94a3b8;
					font-size: 0.7rem;
					margin: 2px 0 6px;
				}
				.mgx__panel button {
					background: none;
					border: none;
					color: #38bdf8;
					font-size: 0.7rem;
					cursor: pointer;
					padding: 0;
				}
				.mgx__tooltip {
					position: fixed;
					z-index: 20;
					pointer-events: none;
					display: flex;
					flex-direction: column;
					gap: 2px;
					padding: 6px 9px;
					border-radius: 8px;
					background: rgba(2, 6, 14, 0.92);
					border: 1px solid rgba(148, 163, 184, 0.25);
					max-width: 240px;
				}
				.mgx__kind {
					font-size: 0.6rem;
					text-transform: uppercase;
					letter-spacing: 0.04em;
					color: #0a0e16;
					background: #38bdf8;
					padding: 0 5px;
					border-radius: 4px;
					align-self: flex-start;
				}
				.mgx__kind--file { background: #a3e635; }
				.mgx__kind--symbol { background: #f0abfc; }
				.mgx__tip-label {
					color: #e2e8f0;
					font-size: 0.76rem;
					word-break: break-word;
				}
				.mgx__tip-sub {
					color: #94a3b8;
					font-size: 0.66rem;
					word-break: break-word;
				}
			`}</style>
		</div>
	);
}
