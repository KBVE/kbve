import { useMemo, useRef, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { useMonorepoGraph, REL_COLORS, REL_LABELS } from './useMonorepoGraph';
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
	ref?: string;
	nx?: { projects: { name: string; type?: string }[] };
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
	const [zoomTrigger, setZoomTrigger] = useState<{ delta: number; seq: number } | null>(null);
	const [resetTrigger, setResetTrigger] = useState(0);
	const [currentZoom, setCurrentZoom] = useState(1);
	const [showStats, setShowStats] = useState(false);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [controlsExpanded, setControlsExpanded] = useState(false);

	const matches = useMemo(() => {
		if (!overview || query.trim().length < 2) return [];
		const q = query.toLowerCase();
		return overview.dirs
			.filter((d) => d.label.toLowerCase().includes(q))
			.slice(0, 8);
	}, [overview, query]);

	const focus = (d: PickedDir) => {
		seq.current += 1;
		setFocusRequest({ id: d.id, seq: seq.current });
		setPicked(d);
		setQuery('');
	};

	const handleZoomIn = () => {
		seq.current += 1;
		setZoomTrigger({ delta: 1.3, seq: seq.current });
	};

	const handleZoomOut = () => {
		seq.current += 1;
		setZoomTrigger({ delta: 0.7, seq: seq.current });
	};

	const handleResetView = () => {
		setResetTrigger((r) => r + 1);
		setPicked(null);
	};

	const toggleFullscreen = () => {
		const elem = document.querySelector('[data-monorepo-graph]');
		if (!elem) return;

		if (!document.fullscreenElement) {
			elem.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
		} else {
			document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
		}
	};

	const toggleStats = () => {
		setShowStats(!showStats);
	};


	// Keyboard shortcuts for navigation
	useEffect(() => {
		const handleKeyboard = (e: KeyboardEvent) => {
			// Ignore if user is typing in an input
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
				return;
			}

			switch (e.key) {
				case '+':
				case '=':
					e.preventDefault();
					handleZoomIn();
					break;
				case '-':
				case '_':
					e.preventDefault();
					handleZoomOut();
					break;
				case 'r':
				case 'R':
					e.preventDefault();
					handleResetView();
					break;
				case 'f':
				case 'F':
					e.preventDefault();
					toggleFullscreen();
					break;
				case 's':
				case 'S':
					e.preventDefault();
					toggleStats();
					break;
			}
		};

		window.addEventListener('keydown', handleKeyboard);
		return () => window.removeEventListener('keydown', handleKeyboard);
	}, []);

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
						dpr={[1, 2]}>
						<color attach="background" args={['#0a0e16']} />
						<TieredGraphScene
							overview={overview}
							loadDir={loadDir}
							getChunk={getChunk}
							colorMode={colorMode}
							labelHost={labelHost}
							focusRequest={focusRequest}
							zoomTrigger={zoomTrigger}
							resetTrigger={resetTrigger}
							onHover={setHover}
							onPickDir={setPicked}
							onZoomChange={setCurrentZoom}
						/>
					</Canvas>

					<div className="mgx__labels" ref={setLabelHost} />

					<div className="mgx__legend">
						<strong>{overview.meta.dirs}</strong> dirs ·{' '}
						<strong>{overview.meta.files.toLocaleString()}</strong>{' '}
						files ·{' '}
						<strong>
							{overview.meta.symbols.toLocaleString()}
						</strong>{' '}
						symbols
					</div>

					<div className="mgx__nav-controls">
						<button
							type="button"
							onClick={handleZoomIn}
							title="Zoom in (+)"
							aria-label="Zoom in">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<circle cx="11" cy="11" r="8" />
								<path d="M21 21l-4.35-4.35" />
								<line x1="11" y1="8" x2="11" y2="14" />
								<line x1="8" y1="11" x2="14" y2="11" />
							</svg>
						</button>
						<button
							type="button"
							onClick={handleZoomOut}
							title="Zoom out (-)"
							aria-label="Zoom out">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<circle cx="11" cy="11" r="8" />
								<path d="M21 21l-4.35-4.35" />
								<line x1="8" y1="11" x2="14" y2="11" />
							</svg>
						</button>
						<button
							type="button"
							onClick={handleResetView}
							title="Reset view (R)"
							aria-label="Reset view">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
								<path d="M21 3v5h-5" />
								<path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
								<path d="M3 21v-5h5" />
							</svg>
						</button>
					</div>

					<div className="mgx__hints">
						<strong>Navigation:</strong> <span className="mgx__hints-desktop">Scroll/pinch to zoom · Drag to pan · Click nodes to explore</span><span className="mgx__hints-mobile">Pinch to zoom · Drag to pan · Tap nodes</span>
						<div className="mgx__hints-desktop" style={{ fontSize: '0.7rem', opacity: 0.85, marginTop: '4px' }}>
							<kbd>+</kbd>/<kbd>-</kbd> zoom · <kbd>R</kbd> reset · <kbd>F</kbd> fullscreen · <kbd>S</kbd> stats
						</div>
					</div>

					<div className="mgx__rels">
						{REL_LABELS.map((r, i) => (
							<span key={r} className="mgx__rel">
								<i style={{ background: rgb(REL_COLORS[i]) }} />
								{r}
							</span>
						))}
					</div>

					<div className={`mgx__controls ${controlsExpanded ? 'is-expanded' : ''}`} data-controls>
						<button
							type="button"
							className="mgx__controls-toggle"
							onClick={() => setControlsExpanded(!controlsExpanded)}
							aria-label={controlsExpanded ? 'Collapse controls' : 'Expand controls'}>
							{controlsExpanded ? '✕' : '☰'}
						</button>
						<div className="mgx__controls-content">
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
													onClick={() => focus(d)}>
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
								onClick={() => setColorMode('dir')}>
								<span className="mgx__btn-label">Color: directory</span>
								<span className="mgx__btn-label-short">Dir</span>
							</button>
							<button
								type="button"
								className={
									colorMode === 'community' ? 'is-active' : ''
								}
								onClick={() => setColorMode('community')}>
								<span className="mgx__btn-label">Color: community</span>
								<span className="mgx__btn-label-short">Comm</span>
							</button>
							<button
								type="button"
								className={showStats ? 'is-active' : ''}
								onClick={toggleStats}
								title="Toggle statistics (S)">
								<span className="mgx__btn-label">📊 Stats</span>
								<span className="mgx__btn-label-short">📊</span>
							</button>
							<button
								type="button"
								onClick={toggleFullscreen}
								title="Fullscreen (F)">
								<span className="mgx__btn-label">{isFullscreen ? '⛶ Exit' : '⛶ Fullscreen'}</span>
								<span className="mgx__btn-label-short">⛶</span>
							</button>
						</div>
					</div>

					{showStats && (
						<div className="mgx__stats">
							<div className="mgx__stats-title">Graph Statistics</div>
							<div className="mgx__stats-grid">
								<div className="mgx__stat">
									<span className="mgx__stat-label">Directories</span>
									<span className="mgx__stat-value">{overview.meta.dirs}</span>
								</div>
								<div className="mgx__stat">
									<span className="mgx__stat-label">Files</span>
									<span className="mgx__stat-value">{overview.meta.files.toLocaleString()}</span>
								</div>
								<div className="mgx__stat">
									<span className="mgx__stat-label">Symbols</span>
									<span className="mgx__stat-value">{overview.meta.symbols.toLocaleString()}</span>
								</div>
								<div className="mgx__stat">
									<span className="mgx__stat-label">Edges</span>
									<span className="mgx__stat-value">{overview.meta.dirEdges.toLocaleString()}</span>
								</div>
								<div className="mgx__stat">
									<span className="mgx__stat-label">Built</span>
									<span className="mgx__stat-value">{overview.meta.built_at_commit.slice(0, 7)}</span>
								</div>
								<div className="mgx__stat">
									<span className="mgx__stat-label">Zoom</span>
									<span className="mgx__stat-value">{currentZoom.toFixed(1)}x</span>
								</div>
							</div>
						</div>
					)}

					{picked && (
						<div className="mgx__panel">
							<button
								type="button"
								className="mgx__panel-close"
								onClick={() => setPicked(null)}
								aria-label="Close panel">
								✕
							</button>
							<div className="mgx__panel-title">
								{picked.label}
							</div>
							<div className="mgx__panel-sub">
								{picked.n.toLocaleString()} symbols ·{' '}
								{picked.files} files
							</div>
							{picked.nx && picked.nx.projects.length > 0 && (
								<div className="mgx__panel-nx">
									{picked.nx.projects.slice(0, 8).map((p) => (
										<span
											key={p.name}
											className="mgx__nx-chip"
											data-type={p.type}>
											{p.name}
										</span>
									))}
									{picked.nx.projects.length > 8 && (
										<span className="mgx__nx-chip">
											+{picked.nx.projects.length - 8}
										</span>
									)}
								</div>
							)}
							{picked.ref && (
								<a className="mgx__panel-ref" href={picked.ref}>
									Read the docs →
								</a>
							)}
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
							}}>
							<span
								className={`mgx__kind mgx__kind--${hover.kind}`}>
								{hover.kind}
							</span>
							<span className="mgx__tip-label">
								{hover.label}
							</span>
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
					font-size: 0.8rem;
					font-weight: 500;
					color: #e2e8f0;
					text-shadow: 0 1px 3px rgba(2, 6, 14, 0.95),
						0 0 6px rgba(2, 6, 14, 0.8);
					will-change: transform;
					pointer-events: none;
					user-select: none;
				}
				@media (max-width: 768px) {
					.mgx__label {
						font-size: 0.75rem;
						font-weight: 600;
						text-shadow: 0 1px 4px rgba(2, 6, 14, 0.98),
							0 0 8px rgba(2, 6, 14, 0.9);
					}
				}
				.mgx__legend {
					position: absolute;
					left: 12px;
					bottom: 12px;
					padding: 8px 12px;
					border-radius: 8px;
					background: rgba(12, 18, 30, 0.82);
					color: #cbd5e1;
					font-size: 0.8rem;
					backdrop-filter: blur(8px);
					pointer-events: none;
					border: 1px solid rgba(148, 163, 184, 0.2);
				}
				.mgx__legend strong { color: #e2e8f0; }
				.mgx__hints {
					position: absolute;
					left: 12px;
					top: 12px;
					padding: 8px 12px;
					border-radius: 8px;
					background: rgba(12, 18, 30, 0.82);
					color: #cbd5e1;
					font-size: 0.8rem;
					backdrop-filter: blur(8px);
					pointer-events: none;
					border: 1px solid rgba(148, 163, 184, 0.2);
					max-width: 420px;
				}
				.mgx__hints strong { color: #e2e8f0; }
				.mgx__hints-mobile { display: none; }
				.mgx__hints-desktop { display: inline; }
				.mgx__hints kbd {
					display: inline-block;
					padding: 2px 6px;
					font-size: 0.7rem;
					font-family: ui-monospace, monospace;
					background: rgba(148, 163, 184, 0.2);
					border: 1px solid rgba(148, 163, 184, 0.4);
					border-radius: 4px;
					color: #e2e8f0;
					box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
				}
				.mgx__nav-controls {
					position: absolute;
					left: 12px;
					bottom: 56px;
					display: flex;
					flex-direction: column;
					gap: 6px;
				}
				.mgx__nav-controls button {
					width: 40px;
					height: 40px;
					padding: 8px;
					border-radius: 8px;
					border: 1px solid rgba(148, 163, 184, 0.3);
					background: rgba(12, 18, 30, 0.82);
					color: #cbd5e1;
					cursor: pointer;
					backdrop-filter: blur(8px);
					display: flex;
					align-items: center;
					justify-content: center;
					transition: all 0.2s ease;
				}
				.mgx__nav-controls button:hover {
					background: rgba(56, 189, 248, 0.2);
					border-color: #38bdf8;
					color: #e0f2fe;
					transform: scale(1.05);
				}
				.mgx__nav-controls button svg {
					width: 20px;
					height: 20px;
				}
				/* Mobile-first responsive design */
				@media (max-width: 768px) {
					.mgx {
						min-height: 100vh;
						border-radius: 0;
					}

					/* Hide desktop hints, show mobile hints */
					.mgx__hints-desktop {
						display: none;
					}
					.mgx__hints-mobile {
						display: inline;
					}
					.mgx__hints {
						font-size: 0.7rem;
						padding: 6px 10px;
						max-width: 280px;
					}

					/* Collapsible controls for mobile */
					.mgx__controls {
						flex-direction: column;
						gap: 0;
					}
					.mgx__controls-toggle {
						display: flex;
						width: 44px;
						height: 44px;
						padding: 10px;
						border-radius: 8px;
						border: 1px solid rgba(148, 163, 184, 0.3);
						background: rgba(12, 18, 30, 0.82);
						color: #cbd5e1;
						font-size: 1.2rem;
						cursor: pointer;
						backdrop-filter: blur(8px);
						align-items: center;
						justify-content: center;
					}
					.mgx__controls-content {
						display: none;
						flex-direction: column;
						background: rgba(12, 18, 30, 0.95);
						border-radius: 10px;
						padding: 8px;
						border: 1px solid rgba(148, 163, 184, 0.3);
						margin-top: 6px;
						max-width: 200px;
					}
					.mgx__controls.is-expanded .mgx__controls-content {
						display: flex;
					}
					.mgx__controls-content > button {
						padding: 10px 14px;
						min-height: 44px;
						width: 100%;
						justify-content: center;
					}

					/* Show short button labels on mobile */
					.mgx__btn-label {
						display: none;
					}
					.mgx__btn-label-short {
						display: inline;
					}

					/* Mobile search */
					.mgx__search {
						width: 100%;
					}
					.mgx__search input {
						min-height: 44px;
						width: 100%;
					}

					/* Hide relationship legend on mobile to save space */
					.mgx__rels {
						display: none;
					}

					/* Bottom-sheet style panel on mobile */
					.mgx__panel {
						left: 0;
						right: 0;
						top: auto;
						bottom: 0;
						max-width: none;
						border-radius: 16px 16px 0 0;
						padding: 16px;
						padding-right: 48px;
						box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.4);
						border-bottom: none;
					}
					.mgx__panel-close {
						top: 12px;
						right: 12px;
						font-size: 1.4rem;
						padding: 6px 8px;
					}

					/* Center stats panel on mobile */
					.mgx__stats {
						left: 50%;
						transform: translateX(-50%);
						right: auto;
						top: 60px;
						min-width: min(320px, calc(100vw - 24px));
						max-width: calc(100vw - 24px);
					}

					/* Better tooltip positioning on mobile */
					.mgx__tooltip {
						max-width: calc(100vw - 32px);
						font-size: 0.75rem;
					}

					/* Adjust navigation controls spacing */
					.mgx__nav-controls {
						left: 8px;
						bottom: 8px;
						gap: 8px;
					}
					.mgx__nav-controls button {
						width: 48px;
						height: 48px;
					}

					/* Adjust legend */
					.mgx__legend {
						left: 8px;
						bottom: 8px;
						font-size: 0.7rem;
						padding: 6px 10px;
					}
				}

				/* Touch-optimized interactions */
				@media (pointer: coarse) {
					.mgx__nav-controls button,
					.mgx__controls-toggle,
					.mgx__controls-content > button,
					.mgx__panel-close {
						min-height: 44px;
						min-width: 44px;
					}
					.mgx__search input {
						min-height: 44px;
					}
				}
				.mgx__rels {
					position: absolute;
					right: 12px;
					bottom: 12px;
					display: flex;
					flex-wrap: wrap;
					gap: 8px;
					padding: 8px 12px;
					border-radius: 8px;
					background: rgba(12, 18, 30, 0.82);
					backdrop-filter: blur(8px);
					pointer-events: none;
					max-width: 340px;
					border: 1px solid rgba(148, 163, 184, 0.2);
				}
				.mgx__rel {
					display: inline-flex;
					align-items: center;
					gap: 5px;
					color: #cbd5e1;
					font-size: 0.75rem;
				}
				.mgx__rel i {
					width: 12px;
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
				.mgx__controls-toggle {
					display: none;
				}
				.mgx__controls-content {
					display: flex;
					gap: 6px;
					align-items: flex-start;
				}
				.mgx__controls-content > button {
					padding: 6px 12px;
					border-radius: 8px;
					border: 1px solid rgba(148, 163, 184, 0.3);
					background: rgba(12, 18, 30, 0.82);
					color: #cbd5e1;
					font-size: 0.8rem;
					cursor: pointer;
					backdrop-filter: blur(8px);
					transition: all 0.2s ease;
				}
				.mgx__controls-content > button:hover {
					background: rgba(56, 189, 248, 0.15);
					border-color: rgba(56, 189, 248, 0.5);
				}
				.mgx__controls-content > button.is-active {
					border-color: #38bdf8;
					color: #e0f2fe;
					background: rgba(56, 189, 248, 0.2);
				}
				.mgx__btn-label-short {
					display: none;
				}
				.mgx__search { position: relative; }
				.mgx__search input {
					width: 180px;
					padding: 6px 12px;
					border-radius: 8px;
					border: 1px solid rgba(148, 163, 184, 0.3);
					background: rgba(12, 18, 30, 0.82);
					color: #e2e8f0;
					font-size: 0.8rem;
					backdrop-filter: blur(8px);
					transition: border-color 0.2s ease;
				}
				.mgx__search input:focus {
					outline: none;
					border-color: #38bdf8;
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
					padding: 6px 10px;
					border: none;
					background: none;
					color: #cbd5e1;
					font-size: 0.78rem;
					cursor: pointer;
					border-radius: 5px;
					text-align: left;
					transition: background 0.2s ease;
				}
				.mgx__search li button:hover {
					background: rgba(56, 189, 248, 0.2);
					color: #e0f2fe;
				}
				.mgx__search li button span {
					color: #64748b;
					font-size: 0.7rem;
				}
				.mgx__stats {
					position: absolute;
					right: 12px;
					top: 56px;
					padding: 12px;
					border-radius: 10px;
					background: rgba(12, 18, 30, 0.92);
					border: 1px solid rgba(148, 163, 184, 0.3);
					color: #e2e8f0;
					font-size: 0.78rem;
					backdrop-filter: blur(8px);
					min-width: 180px;
					z-index: 10;
				}
				.mgx__stats-title {
					font-weight: 600;
					font-size: 0.85rem;
					margin-bottom: 8px;
					color: #e2e8f0;
				}
				.mgx__stats-grid {
					display: grid;
					grid-template-columns: 1fr 1fr;
					gap: 8px;
				}
				.mgx__stat {
					display: flex;
					flex-direction: column;
					gap: 2px;
				}
				.mgx__stat-label {
					font-size: 0.68rem;
					color: #94a3b8;
					text-transform: uppercase;
					letter-spacing: 0.05em;
				}
				.mgx__stat-value {
					font-size: 0.95rem;
					font-weight: 600;
					color: #38bdf8;
					font-family: ui-monospace, monospace;
				}
				.mgx__panel {
					position: absolute;
					left: 12px;
					top: 12px;
					padding: 10px 12px 10px 12px;
					padding-right: 40px;
					border-radius: 10px;
					background: rgba(12, 18, 30, 0.82);
					border: 1px solid rgba(148, 163, 184, 0.25);
					color: #e2e8f0;
					font-size: 0.78rem;
					backdrop-filter: blur(6px);
					max-width: 260px;
				}
				.mgx__panel-title { font-weight: 600; }
				.mgx__panel-close {
					position: absolute;
					top: 8px;
					right: 8px;
					background: none;
					border: none;
					color: #94a3b8;
					font-size: 1rem;
					cursor: pointer;
					padding: 4px 6px;
					line-height: 1;
					transition: color 0.2s ease;
				}
				.mgx__panel-close:hover {
					color: #e2e8f0;
				}
				.mgx__panel-nx { display: flex; flex-wrap: wrap; gap: 4px; margin: 0 0 6px; }
				.mgx__nx-chip {
					font-size: 0.64rem;
					padding: 1px 6px;
					border-radius: 5px;
					background: rgba(184, 148, 255, 0.16);
					color: #d8c7ff;
					border: 1px solid rgba(184, 148, 255, 0.3);
				}
				.mgx__nx-chip[data-type='app'] {
					background: rgba(56, 189, 248, 0.16);
					color: #bae6fd;
					border-color: rgba(56, 189, 248, 0.3);
				}
				.mgx__panel-ref {
					display: inline-block;
					margin-bottom: 4px;
					color: #38bdf8;
					font-size: 0.72rem;
					text-decoration: none;
				}
				.mgx__panel-ref:hover { text-decoration: underline; }
				.mgx__panel-sub {
					color: #94a3b8;
					font-size: 0.7rem;
					margin: 2px 0 6px;
				}
				.mgx__tooltip {
					position: fixed;
					z-index: 20;
					pointer-events: none;
					display: flex;
					flex-direction: column;
					gap: 4px;
					padding: 10px 12px;
					border-radius: 8px;
					background: rgba(2, 6, 14, 0.95);
					border: 1px solid rgba(148, 163, 184, 0.3);
					max-width: 280px;
					backdrop-filter: blur(8px);
				}
				.mgx__kind {
					font-size: 0.65rem;
					text-transform: uppercase;
					letter-spacing: 0.05em;
					font-weight: 600;
					color: #0a0e16;
					background: #38bdf8;
					padding: 3px 8px;
					border-radius: 5px;
					align-self: flex-start;
					box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
				}
				.mgx__kind::before {
					content: '';
					display: inline-block;
					width: 6px;
					height: 6px;
					border-radius: 50%;
					background: currentColor;
					margin-right: 4px;
					opacity: 0.8;
				}
				.mgx__kind--file {
					background: #a3e635;
					color: #1a2e05;
				}
				.mgx__kind--symbol {
					background: #f0abfc;
					color: #3b0764;
				}
				.mgx__tip-label {
					color: #e2e8f0;
					font-size: 0.85rem;
					font-weight: 500;
					word-break: break-word;
				}
				.mgx__tip-sub {
					color: #94a3b8;
					font-size: 0.75rem;
					word-break: break-word;
				}
			`}</style>
		</div>
	);
}
