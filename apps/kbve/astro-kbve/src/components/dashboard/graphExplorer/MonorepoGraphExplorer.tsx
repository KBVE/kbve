import { useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import {
	useMonorepoGraph,
	REL_COLORS,
	REL_LABELS,
} from './useMonorepoGraph';
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

const rgb = (c: [number, number, number]) =>
	`rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(
		c[2] * 255,
	)})`;

/**
 * Tiered monorepo dependency explorer. Loads a tiny directory overview on
 * mount and lazily drills into per-directory files and symbols as you zoom —
 * a filesystem-hierarchy level-of-detail that scales to the full ~67k-symbol
 * graph. Labels, hover focus-mode, relation-colored edges, search and
 * click-to-source round out navigation.
 */
export default function MonorepoGraphExplorer({ base }: Props) {
	const { overview, loading, error, loadDir, getChunk } =
		useMonorepoGraph(base);
	const [colorMode, setColorMode] = useState<ColorMode>('dir');
	const [hover, setHover] = useState<HoverInfo | null>(null);
	const [picked, setPicked] = useState<PickedDir | null>(null);
	const [query, setQuery] = useState('');
	const [focusRequest, setFocusRequest] = useState<{
		id: string;
		seq: number;
	} | null>(null);
	const seq = useRef(0);
	const [labelHost, setLabelHost] = useState<HTMLDivElement | null>(null);

	const matches = useMemo(() => {
		if (!overview || query.trim().length < 2) return [];
		const q = query.toLowerCase();
		return overview.dirs
			.filter((d) => d.label.toLowerCase().includes(q))
			.slice(0, 8);
	}, [overview, query]);

	const focus = (id: string, label: string, n: number, files: number) => {
		seq.current += 1;
		setFocusRequest({ id, seq: seq.current });
		setPicked({ id, label, n, files });
		setQuery('');
	};

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
							labelHost={labelHost}
							focusRequest={focusRequest}
							onHover={setHover}
							onPickDir={setPicked}
						/>
					</Canvas>

					<div className="mgx__labels" ref={setLabelHost} />

					<div className="mgx__legend">
						<strong>{overview.meta.dirs}</strong> dirs ·{' '}
						<strong>
							{overview.meta.files.toLocaleString()}
						</strong>{' '}
						files ·{' '}
						<strong>
							{overview.meta.symbols.toLocaleString()}
						</strong>{' '}
						symbols — scroll to drill in, drag to pan, click to open
						source
					</div>

					<div className="mgx__rels">
						{REL_LABELS.map((r, i) => (
							<span key={r} className="mgx__rel">
								<i style={{ background: rgb(REL_COLORS[i]) }} />
								{r}
							</span>
						))}
					</div>

					<div className="mgx__controls">
						<div className="mgx__search">
							<input
								type="text"
								placeholder="Search directory…"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
							/>
							{matches.length > 0 && (
								<ul>
									{matches.map((d) => (
										<li key={d.id}>
											<button
												type="button"
												onClick={() =>
													focus(
														d.id,
														d.label,
														d.n,
														d.files,
													)
												}
											>
												{d.label}
												<span>{d.n}</span>
											</button>
										</li>
									))}
								</ul>
							)}
						</div>
						<button
							type="button"
							className={colorMode === 'dir' ? 'is-active' : ''}
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
								left: Math.min(
									hover.x + 14,
									window.innerWidth - 260,
								),
								top: hover.y + 14,
							}}
						>
							<span
								className={`mgx__kind mgx__kind--${hover.kind}`}
							>
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
				.mgx__labels {
					position: absolute;
					inset: 0;
					pointer-events: none;
					overflow: hidden;
				}
				.mgx__label {
					position: absolute;
					top: 0;
					left: 0;
					white-space: nowrap;
					font-size: 0.68rem;
					font-weight: 500;
					color: #e2e8f0;
					text-shadow: 0 1px 3px rgba(2, 6, 14, 0.95),
						0 0 6px rgba(2, 6, 14, 0.8);
					will-change: transform;
				}
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
				.mgx__rels {
					position: absolute;
					right: 12px;
					bottom: 12px;
					display: flex;
					flex-wrap: wrap;
					gap: 8px;
					padding: 6px 10px;
					border-radius: 8px;
					background: rgba(12, 18, 30, 0.72);
					backdrop-filter: blur(6px);
					pointer-events: none;
					max-width: 340px;
				}
				.mgx__rel {
					display: inline-flex;
					align-items: center;
					gap: 4px;
					color: #cbd5e1;
					font-size: 0.66rem;
				}
				.mgx__rel i {
					width: 10px;
					height: 3px;
					border-radius: 2px;
				}
				.mgx__controls {
					position: absolute;
					right: 12px;
					top: 12px;
					display: flex;
					gap: 6px;
					align-items: flex-start;
				}
				.mgx__controls > button {
					padding: 5px 10px;
					border-radius: 8px;
					border: 1px solid rgba(148, 163, 184, 0.3);
					background: rgba(12, 18, 30, 0.72);
					color: #cbd5e1;
					font-size: 0.72rem;
					cursor: pointer;
					backdrop-filter: blur(6px);
				}
				.mgx__controls > button.is-active {
					border-color: #38bdf8;
					color: #e0f2fe;
				}
				.mgx__search { position: relative; }
				.mgx__search input {
					width: 170px;
					padding: 5px 10px;
					border-radius: 8px;
					border: 1px solid rgba(148, 163, 184, 0.3);
					background: rgba(12, 18, 30, 0.82);
					color: #e2e8f0;
					font-size: 0.72rem;
					backdrop-filter: blur(6px);
				}
				.mgx__search ul {
					position: absolute;
					top: 32px;
					left: 0;
					right: 0;
					margin: 0;
					padding: 4px;
					list-style: none;
					border-radius: 8px;
					background: rgba(9, 14, 24, 0.96);
					border: 1px solid rgba(148, 163, 184, 0.25);
				}
				.mgx__search li { margin: 0; }
				.mgx__search li button {
					display: flex;
					justify-content: space-between;
					gap: 8px;
					width: 100%;
					padding: 5px 8px;
					border: none;
					background: none;
					color: #cbd5e1;
					font-size: 0.72rem;
					cursor: pointer;
					border-radius: 5px;
					text-align: left;
				}
				.mgx__search li button:hover { background: rgba(56, 189, 248, 0.15); }
				.mgx__search li button span { color: #64748b; }
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
