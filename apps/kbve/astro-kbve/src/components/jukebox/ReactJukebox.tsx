import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ─── Minimal YT IFrame API types ──────────────────────────────────────────────
declare global {
	interface Window {
		YT: {
			Player: new (
				el: HTMLElement,
				opts: {
					videoId?: string;
					playerVars?: Record<string, number | string>;
					events?: {
						onReady?: (e: { target: YTPlayer }) => void;
						onStateChange?: (e: {
							data: number;
							target: YTPlayer;
						}) => void;
					};
				},
			) => YTPlayer;
			PlayerState: Record<string, number>;
		};
		onYouTubeIframeAPIReady?: () => void;
	}
}
interface YTPlayer {
	playVideo(): void;
	pauseVideo(): void;
	cueVideoById(id: string): void;
	loadVideoById(id: string): void;
	mute(): void;
	unMute(): void;
	destroy(): void;
	getDuration(): number;
	getCurrentTime(): number;
	seekTo(seconds: number, allowSeekAhead: boolean): void;
	setVolume(volume: number): void;
	getVolume(): number;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Genre {
	slug: string;
	title: string;
	tracks: string[];
	sets: string[];
}
interface Props {
	genres: Genre[];
}

// ─── Pixel overlay GLSL ───────────────────────────────────────────────────────
// Vertex shader writes clip-space directly — bypasses camera, always fills canvas
const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// CRT-style dot-matrix grid overlay.  No video sampling needed —
// it's a stylistic screen filter rendered on top of the iframe.
const fragmentShader = `
uniform float uTime;
uniform float uPixelSize;
uniform vec3  uColor;
uniform float uIntensity;

varying vec2 vUv;

void main() {
  // Grid cell coordinates (0..1 within each cell)
  vec2 cell = fract(vUv * uPixelSize);

  // Distance from center of cell → circular dot
  float dist = length(cell - vec2(0.5));
  float dot_ = 1.0 - smoothstep(0.12, 0.36, dist);

  // Scanline: every other row slightly dimmer
  float row      = floor(vUv.y * uPixelSize);
  float scanline  = mod(row, 2.0) < 1.0 ? 1.0 : 0.45;

  // Slow heartbeat pulse when playing
  float pulse = sin(uTime * 1.8) * 0.07 + 0.93;

  // Soft vignette — brighter centre
  vec2  c       = vUv - vec2(0.5);
  float vignette = 1.0 - smoothstep(0.25, 0.72, length(c));

  float alpha = dot_ * scanline * vignette * uIntensity * pulse * 0.38;
  gl_FragColor  = vec4(uColor, alpha);
}
`;

// ─── R3F pixel overlay mesh ───────────────────────────────────────────────────
function PixelOverlay({
	color,
	playing,
	pixelSize,
}: {
	color: string;
	playing: boolean;
	pixelSize: number;
}) {
	const uniforms = useMemo(
		() => ({
			uTime: { value: 0 },
			uPixelSize: { value: pixelSize },
			uColor: { value: new THREE.Color(color) },
			uIntensity: { value: playing ? 1.0 : 0.2 },
		}),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[],
	);

	useFrame(({ clock }) => {
		uniforms.uTime.value = clock.elapsedTime;
		uniforms.uPixelSize.value = pixelSize;
		uniforms.uColor.value.set(color);
		uniforms.uIntensity.value = THREE.MathUtils.lerp(
			uniforms.uIntensity.value,
			playing ? 1.0 : 0.15,
			0.05,
		);
	});

	return (
		<mesh>
			{/* 2×2 plane in NDC — vertex shader maps this to full clip space */}
			<planeGeometry args={[2, 2]} />
			<shaderMaterial
				uniforms={uniforms}
				vertexShader={vertexShader}
				fragmentShader={fragmentShader}
				transparent
				depthWrite={false}
			/>
		</mesh>
	);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(s: number) {
	if (!s || !isFinite(s)) return '0:00';
	const m = Math.floor(s / 60);
	const sec = Math.floor(s % 60);
	return `${m}:${sec.toString().padStart(2, '0')}`;
}

const btnBase: React.CSSProperties = {
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center',
	padding: '4px 8px',
	borderRadius: '4px',
	cursor: 'pointer',
	fontSize: '14px',
	lineHeight: 1,
	background: 'var(--sl-color-bg-nav)',
	color: 'var(--sl-color-text)',
	border: '1px solid var(--sl-color-hairline)',
	transition: 'opacity 0.15s',
};

const btnAccent: React.CSSProperties = {
	...btnBase,
	background: 'var(--sl-color-accent-low)',
	color: 'var(--sl-color-accent-high)',
	border: '1px solid var(--sl-color-accent)',
};

// ─── Main component ────────────────────────────────────────────────────────────
export default function ReactJukebox({ genres }: Props) {
	// UI state
	const [genreSlug, setGenreSlug] = useState(genres[0]?.slug ?? '');
	const [activeDeck, setActiveDeck] = useState<'A' | 'B'>('A');
	const [deckAId, setDeckAId] = useState<string | null>(null);
	const [deckBId, setDeckBId] = useState<string | null>(null);
	const [transitioning, setTransitioning] = useState(false);
	const [ytReady, setYtReady] = useState(false);
	const [playing, setPlaying] = useState(false);
	const [accentColor, setAccentColor] = useState('#a78bfa');
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [volume, setVolume] = useState(80);
	const [pixelSize, setPixelSize] = useState(40);

	// YT player refs — created once, updated via API calls not remounts
	const deckAEl = useRef<HTMLDivElement>(null!);
	const deckBEl = useRef<HTMLDivElement>(null!);
	const playerA = useRef<YTPlayer | null>(null);
	const playerB = useRef<YTPlayer | null>(null);

	// Mirror mutable state into refs so YT callbacks never go stale
	const st = useRef({
		activeDeck: 'A' as 'A' | 'B',
		deckAId: null as string | null,
		deckBId: null as string | null,
		transitioning: false,
		allItems: [] as string[],
	});

	const genre = genres.find((g) => g.slug === genreSlug) ?? genres[0];
	const allItems = useMemo(
		() => (genre ? [...genre.tracks, ...genre.sets] : []),
		[genre],
	);

	// Keep ref in sync every render
	useEffect(() => {
		st.current.activeDeck = activeDeck;
		st.current.deckAId = deckAId;
		st.current.deckBId = deckBId;
		st.current.allItems = allItems;
	});

	const activeId = activeDeck === 'A' ? deckAId : deckBId;
	const currentIdx = activeId ? allItems.indexOf(activeId) : -1;

	const getActivePlayer = useCallback(
		() =>
			st.current.activeDeck === 'A' ? playerA.current : playerB.current,
		[],
	);

	// ── Poll playback time ──────────────────────────────────────────────────
	useEffect(() => {
		if (!playing) return;
		const id = setInterval(() => {
			const p = getActivePlayer();
			if (!p) return;
			try {
				setCurrentTime(p.getCurrentTime());
				const d = p.getDuration();
				if (d > 0) setDuration(d);
			} catch {
				// player not ready yet
			}
		}, 500);
		return () => clearInterval(id);
	}, [playing, getActivePlayer]);

	// ── Load YT IFrame API ──────────────────────────────────────────────────
	useEffect(() => {
		if ((window as unknown as { YT?: { Player?: unknown } }).YT?.Player) {
			setYtReady(true);
			return;
		}
		const tag = document.createElement('script');
		tag.src = 'https://www.youtube.com/iframe_api';
		document.head.appendChild(tag);
		window.onYouTubeIframeAPIReady = () => setYtReady(true);
		return () => {
			delete window.onYouTubeIframeAPIReady;
		};
	}, []);

	// ── Read Starlight accent color ────────────────────────────────────────
	useEffect(() => {
		const c = getComputedStyle(document.documentElement)
			.getPropertyValue('--sl-color-accent')
			.trim();
		if (c) setAccentColor(c);
	}, []);

	// ── Deck swap transition ────────────────────────────────────────────────
	const triggerTransition = useCallback((incomingId?: string) => {
		const s = st.current;
		if (s.transitioning) return;

		const incomingPlayer =
			s.activeDeck === 'A' ? playerB.current : playerA.current;
		const id = incomingId ?? (s.activeDeck === 'A' ? s.deckBId : s.deckAId);
		if (!id) return;

		s.transitioning = true;
		setTransitioning(true);

		incomingPlayer?.unMute();
		incomingPlayer?.playVideo();

		setTimeout(() => {
			setActiveDeck((prev) => {
				const next = prev === 'A' ? 'B' : 'A';
				const inactivePlayer =
					prev === 'A' ? playerA.current : playerB.current;

				const items = s.allItems;
				const nowIdx = items.indexOf(
					prev === 'A' ? (s.deckBId ?? '') : (s.deckAId ?? ''),
				);
				const nextNextId =
					nowIdx >= 0 && nowIdx + 1 < items.length
						? items[nowIdx + 1]
						: null;

				if (nextNextId) {
					inactivePlayer?.cueVideoById(nextNextId);
					inactivePlayer?.mute();
					if (prev === 'A') setDeckAId(nextNextId);
					else setDeckBId(nextNextId);
				}
				return next;
			});

			s.transitioning = false;
			setTransitioning(false);
			setCurrentTime(0);
		}, 700);
	}, []);

	// ── Init players once YT is ready ──────────────────────────────────────
	useEffect(() => {
		if (!ytReady) return;

		const params = new URLSearchParams(window.location.search);
		const ytParam = params.get('yt');
		let firstId: string | null = null;
		let secondId: string | null = null;

		if (ytParam) {
			for (const g of genres) {
				const items = [...g.tracks, ...g.sets];
				const idx = items.indexOf(ytParam);
				if (idx >= 0) {
					setGenreSlug(g.slug);
					firstId = ytParam;
					secondId = items[idx + 1] ?? null;
					break;
				}
			}
		}

		if (!firstId) {
			const items = [
				...(genres[0]?.tracks ?? []),
				...(genres[0]?.sets ?? []),
			];
			firstId = items[0] ?? null;
			secondId = items[1] ?? null;
		}

		setDeckAId(firstId);
		setDeckBId(secondId);
		st.current.deckAId = firstId;
		st.current.deckBId = secondId;

		if (firstId) {
			const url = new URL(window.location.href);
			url.searchParams.set('yt', firstId);
			window.history.replaceState({}, '', url.toString());
		}

		playerA.current = new window.YT.Player(deckAEl.current, {
			videoId: firstId ?? undefined,
			playerVars: {
				autoplay: 1,
				controls: 0,
				rel: 0,
				modestbranding: 1,
				playsinline: 1,
			},
			events: {
				onReady: (e) => {
					e.target.setVolume(volume);
				},
				onStateChange: (e) => {
					if (e.data === 1) {
						setPlaying(true);
						try {
							const d = e.target.getDuration();
							if (d > 0) setDuration(d);
						} catch {}
					}
					if (e.data === 2) setPlaying(false);
					if (e.data === 0 && !st.current.transitioning)
						triggerTransition();
				},
			},
		});

		playerB.current = new window.YT.Player(deckBEl.current, {
			videoId: secondId ?? undefined,
			playerVars: {
				autoplay: 0,
				controls: 0,
				rel: 0,
				mute: 1,
				modestbranding: 1,
				playsinline: 1,
			},
		});

		return () => {
			playerA.current?.destroy();
			playerB.current?.destroy();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ytReady]);

	// ── Manual track select ─────────────────────────────────────────────────
	const playTrack = useCallback((ytId: string) => {
		const s = st.current;
		const activePlayer =
			s.activeDeck === 'A' ? playerA.current : playerB.current;
		const nextPlayer =
			s.activeDeck === 'A' ? playerB.current : playerA.current;

		activePlayer?.loadVideoById(ytId);
		setPlaying(true);
		setCurrentTime(0);

		if (s.activeDeck === 'A') setDeckAId(ytId);
		else setDeckBId(ytId);

		const items = s.allItems;
		const idx = items.indexOf(ytId);
		const nextId =
			idx >= 0 && idx + 1 < items.length ? items[idx + 1] : null;
		if (nextId) {
			nextPlayer?.cueVideoById(nextId);
			nextPlayer?.mute();
			if (s.activeDeck === 'A') setDeckBId(nextId);
			else setDeckAId(nextId);
		}

		const url = new URL(window.location.href);
		url.searchParams.set('yt', ytId);
		window.history.replaceState({}, '', url.toString());
	}, []);

	// ── Genre select ────────────────────────────────────────────────────────
	const selectGenre = useCallback(
		(slug: string) => {
			const g = genres.find((x) => x.slug === slug);
			if (!g) return;
			setGenreSlug(slug);
			const first = g.tracks[0] ?? g.sets[0] ?? null;
			if (first) playTrack(first);
		},
		[genres, playTrack],
	);

	// ── Transport controls ──────────────────────────────────────────────────
	const togglePlay = useCallback(() => {
		const p = getActivePlayer();
		if (!p) return;
		if (playing) {
			p.pauseVideo();
			setPlaying(false);
		} else {
			p.playVideo();
			setPlaying(true);
		}
	}, [playing, getActivePlayer]);

	const rewind = useCallback(() => {
		const p = getActivePlayer();
		if (!p) return;
		const t = Math.max(0, currentTime - 10);
		p.seekTo(t, true);
		setCurrentTime(t);
	}, [currentTime, getActivePlayer]);

	const forward = useCallback(() => {
		const p = getActivePlayer();
		if (!p) return;
		const t = Math.min(duration || Infinity, currentTime + 10);
		p.seekTo(t, true);
		setCurrentTime(t);
	}, [currentTime, duration, getActivePlayer]);

	const handleSeek = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const t = parseFloat(e.target.value);
			getActivePlayer()?.seekTo(t, true);
			setCurrentTime(t);
		},
		[getActivePlayer],
	);

	const handleVolume = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const v = parseInt(e.target.value);
			setVolume(v);
			getActivePlayer()?.setVolume(v);
		},
		[getActivePlayer],
	);

	// ── Deck visual styles ──────────────────────────────────────────────────
	// Active deck fills available space; inactive deck is a fixed narrow
	// "next up" preview column — not meant to be interacted with directly.
	const deckStyle = (deck: 'A' | 'B'): React.CSSProperties => {
		const isActive = deck === activeDeck;
		return {
			flex: isActive ? '1 1 0' : '0 0 130px',
			minWidth: isActive ? 0 : '130px',
			maxWidth: isActive ? undefined : '130px',
			opacity: isActive ? 1 : 0.6,
			transition:
				'flex 0.65s cubic-bezier(.4,0,.2,1), opacity 0.65s ease',
			position: 'relative',
			overflow: 'hidden',
			borderRadius: '8px',
			// Inactive deck is display-only — block pointer events on its surface
			pointerEvents: isActive ? 'auto' : 'none',
		};
	};

	const inactiveId = activeDeck === 'A' ? deckBId : deckAId;

	return (
		<div
			className="flex h-full overflow-hidden"
			style={{ background: 'var(--sl-color-bg, #0d0d1a)' }}>
			{/* ── Genre sidebar ──────────────────────────────────────── */}
			<div
				className="flex flex-col overflow-hidden flex-shrink-0 w-36"
				style={{ borderRight: '1px solid var(--sl-color-hairline)' }}>
				<div
					className="px-3 py-2 text-[10px] uppercase tracking-widest flex-shrink-0"
					style={{
						color: 'var(--sl-color-text-accent, #a78bfa)',
						borderBottom: '1px solid var(--sl-color-hairline)',
					}}>
					Genres
				</div>
				<div className="flex-1 overflow-y-auto">
					{genres.map((g) => (
						<button
							key={g.slug}
							onClick={() => selectGenre(g.slug)}
							className="w-full text-left px-3 py-2 text-sm transition-colors"
							style={{
								background:
									g.slug === genreSlug
										? 'var(--sl-color-accent-low, rgba(167,139,250,.15))'
										: 'transparent',
								color:
									g.slug === genreSlug
										? 'var(--sl-color-accent-high, #a78bfa)'
										: 'var(--sl-color-text, #e0e0e0)',
								borderBottom:
									'1px solid var(--sl-color-hairline)',
								fontWeight: g.slug === genreSlug ? 600 : 400,
							}}>
							{g.title}
						</button>
					))}
				</div>
			</div>

			{/* ── Main column ─────────────────────────────────────────── */}
			<div className="flex flex-1 flex-col min-w-0 overflow-hidden">
				{/* Deck area */}
				<div
					className="flex gap-2 p-2"
					style={{ flex: '0 0 48%', overflow: 'hidden' }}>
					{/* Deck A */}
					<div style={deckStyle('A')}>
						<div ref={deckAEl} className="w-full h-full" />
						{/* Pixel overlay — always rendered, intensity driven by active+playing */}
						<div
							className="absolute inset-0"
							style={{ pointerEvents: 'none' }}>
							<Canvas style={{ background: 'transparent' }}>
								<PixelOverlay
									color={accentColor}
									playing={playing && activeDeck === 'A'}
									pixelSize={pixelSize}
								/>
							</Canvas>
						</div>
						<div
							className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded font-mono tracking-widest"
							style={{
								background:
									'var(--sl-color-accent-low, rgba(0,0,0,.5))',
								color: 'var(--sl-color-accent-high, #a78bfa)',
							}}>
							{activeDeck === 'A' ? '▶ DECK A' : '⏸ DECK A'}
						</div>
					</div>

					{/* Deck B */}
					<div style={deckStyle('B')}>
						<div ref={deckBEl} className="w-full h-full" />
						{/* Pixel overlay over video only */}
						<div
							className="absolute inset-0"
							style={{ pointerEvents: 'none' }}>
							<Canvas style={{ background: 'transparent' }}>
								<PixelOverlay
									color={accentColor}
									playing={playing && activeDeck === 'B'}
									pixelSize={pixelSize}
								/>
							</Canvas>
						</div>
						{/* When inactive: dim overlay + "NEXT" label centered */}
						{activeDeck === 'A' && (
							<div
								className="absolute inset-0 flex flex-col items-center justify-end pb-3 gap-1"
								style={{
									background: 'rgba(0,0,0,0.35)',
									pointerEvents: 'none',
								}}>
								<span
									className="text-[9px] uppercase tracking-widest font-mono px-2 py-0.5 rounded"
									style={{
										background:
											'var(--sl-color-accent-low)',
										color: 'var(--sl-color-accent-high)',
										border: '1px solid var(--sl-color-accent)',
									}}>
									UP NEXT
								</span>
							</div>
						)}
						{/* Active label when B is playing */}
						{activeDeck === 'B' && (
							<div
								className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded font-mono tracking-widest"
								style={{
									background:
										'var(--sl-color-accent-low, rgba(0,0,0,.5))',
									color: 'var(--sl-color-accent-high, #a78bfa)',
									pointerEvents: 'none',
								}}>
								▶ DECK B
							</div>
						)}
					</div>
				</div>

				{/* ── Controls ────────────────────────────────────────── */}
				<div
					className="flex flex-col gap-1.5 px-4 py-2 flex-shrink-0"
					style={{
						borderTop: '1px solid var(--sl-color-hairline)',
						borderBottom: '1px solid var(--sl-color-hairline)',
						background:
							'var(--sl-color-bg-nav, rgba(255,255,255,.03))',
					}}>
					{/* Progress bar */}
					<div className="flex items-center gap-2">
						<span
							className="text-[10px] font-mono flex-shrink-0 w-8 text-right"
							style={{ color: 'var(--sl-color-gray-3)' }}>
							{fmt(currentTime)}
						</span>
						<input
							type="range"
							min={0}
							max={duration || 100}
							step={0.5}
							value={currentTime}
							onChange={handleSeek}
							className="flex-1 h-1"
							style={{ accentColor: 'var(--sl-color-accent)' }}
						/>
						<span
							className="text-[10px] font-mono flex-shrink-0 w-8"
							style={{ color: 'var(--sl-color-gray-3)' }}>
							{fmt(duration)}
						</span>
					</div>

					{/* Transport + volume + pixel knob */}
					<div className="flex items-center gap-1.5 flex-wrap">
						{/* Prev */}
						<button
							onClick={() =>
								currentIdx > 0 &&
								playTrack(allItems[currentIdx - 1])
							}
							disabled={currentIdx <= 0}
							style={{
								...btnBase,
								opacity: currentIdx <= 0 ? 0.3 : 1,
								cursor:
									currentIdx <= 0 ? 'not-allowed' : 'pointer',
							}}
							title="Previous track">
							⏮
						</button>

						{/* Rewind -10s */}
						<button
							onClick={rewind}
							style={btnBase}
							title="Back 10s">
							⏪
						</button>

						{/* Play / Pause */}
						<button
							onClick={togglePlay}
							style={{ ...btnAccent, minWidth: '2.2rem' }}
							title={playing ? 'Pause' : 'Play'}>
							{playing ? '⏸' : '▶'}
						</button>

						{/* Forward +10s */}
						<button
							onClick={forward}
							style={btnBase}
							title="Forward 10s">
							⏩
						</button>

						{/* Next (DJ transition) */}
						<button
							onClick={() => triggerTransition()}
							disabled={
								transitioning ||
								currentIdx >= allItems.length - 1
							}
							style={{
								...btnAccent,
								opacity:
									transitioning ||
									currentIdx >= allItems.length - 1
										? 0.3
										: 1,
								cursor:
									transitioning ||
									currentIdx >= allItems.length - 1
										? 'not-allowed'
										: 'pointer',
							}}
							title="Next track (DJ mix)">
							{transitioning ? '⟳' : '⏭'}
						</button>

						{/* Now playing label */}
						<span
							className="flex-1 font-mono text-[10px] truncate px-1 min-w-0"
							style={{ color: 'var(--sl-color-gray-3)' }}>
							{activeId ?? '—'}
						</span>

						{/* Pixel size knob */}
						<span
							className="text-[10px] flex-shrink-0"
							style={{ color: 'var(--sl-color-gray-4)' }}
							title="Pixel overlay size">
							⊞
						</span>
						<input
							type="range"
							min={8}
							max={120}
							step={4}
							value={pixelSize}
							onChange={(e) =>
								setPixelSize(parseInt(e.target.value))
							}
							className="w-14"
							title="Pixel grid density"
							style={{ accentColor: 'var(--sl-color-accent)' }}
						/>

						{/* Volume */}
						<span
							className="text-sm flex-shrink-0"
							style={{ color: 'var(--sl-color-gray-3)' }}
							title="Volume">
							🔊
						</span>
						<input
							type="range"
							min={0}
							max={100}
							value={volume}
							onChange={handleVolume}
							className="w-16"
							style={{ accentColor: 'var(--sl-color-accent)' }}
						/>
					</div>
				</div>

				{/* ── Track list ───────────────────────────────────────── */}
				<div className="flex-1 overflow-y-auto px-4 py-3">
					{genre && (
						<>
							{genre.tracks.length > 0 && (
								<div className="mb-4">
									<div
										className="text-[10px] uppercase tracking-widest mb-2"
										style={{
											color: 'var(--sl-color-gray-4, #606070)',
										}}>
										Tracks
									</div>
									{genre.tracks.map((id, i) => (
										<div
											key={id}
											onClick={() => playTrack(id)}
											className="flex items-center gap-3 px-2 py-1.5 rounded cursor-pointer text-sm transition-colors"
											style={{
												background:
													id === activeId
														? 'var(--sl-color-accent-low, rgba(167,139,250,.15))'
														: 'transparent',
												color:
													id === activeId
														? 'var(--sl-color-accent-high, #a78bfa)'
														: 'var(--sl-color-text, #e0e0e0)',
												opacity:
													id === inactiveId ? 0.6 : 1,
											}}>
											<span
												className="w-5 text-xs text-right flex-shrink-0"
												style={{
													color: 'var(--sl-color-gray-4)',
												}}>
												{i + 1}
											</span>
											<span className="font-mono text-xs truncate">
												{id}
											</span>
											{id === activeId && (
												<span
													className="ml-auto flex-shrink-0 text-xs"
													style={{
														color: 'var(--sl-color-accent-high)',
													}}>
													♪
												</span>
											)}
											{id === inactiveId && (
												<span
													className="ml-auto flex-shrink-0 text-[10px]"
													style={{
														color: 'var(--sl-color-text-accent)',
													}}>
													next
												</span>
											)}
										</div>
									))}
								</div>
							)}
							{genre.sets.length > 0 && (
								<div>
									<div
										className="text-[10px] uppercase tracking-widest mb-2"
										style={{
											color: 'var(--sl-color-gray-4, #606070)',
										}}>
										Sets / Radio
									</div>
									{genre.sets.map((id, i) => (
										<div
											key={id}
											onClick={() => playTrack(id)}
											className="flex items-center gap-3 px-2 py-1.5 rounded cursor-pointer text-sm transition-colors"
											style={{
												background:
													id === activeId
														? 'var(--sl-color-accent-low)'
														: 'transparent',
												color:
													id === activeId
														? 'var(--sl-color-accent-high)'
														: 'var(--sl-color-text)',
											}}>
											<span
												className="w-5 text-xs text-right flex-shrink-0"
												style={{
													color: 'var(--sl-color-accent)',
												}}>
												{i + 1}
											</span>
											<span className="font-mono text-xs truncate">
												{id}
											</span>
											{id === activeId && (
												<span
													className="ml-auto flex-shrink-0 text-xs"
													style={{
														color: 'var(--sl-color-accent-high)',
													}}>
													♪
												</span>
											)}
										</div>
									))}
								</div>
							)}
						</>
					)}
				</div>
			</div>
		</div>
	);
}
