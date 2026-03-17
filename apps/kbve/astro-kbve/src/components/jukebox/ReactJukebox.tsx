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

// ─── R3F ambient particle overlay ─────────────────────────────────────────────
function AmbientParticles({
	color,
	playing,
}: {
	color: string;
	playing: boolean;
}) {
	const ref = useRef<THREE.Points>(null!);
	const count = 80;

	const { positions, speeds } = useMemo(() => {
		const positions = new Float32Array(count * 3);
		const speeds = new Float32Array(count);
		for (let i = 0; i < count; i++) {
			positions[i * 3] = (Math.random() - 0.5) * 8;
			positions[i * 3 + 1] = Math.random() * 8 - 4;
			positions[i * 3 + 2] = 0;
			speeds[i] = 0.003 + Math.random() * 0.008;
		}
		return { positions, speeds };
	}, []);

	useFrame(() => {
		if (!ref.current) return;
		const pos = ref.current.geometry.attributes.position
			.array as Float32Array;
		const rate = playing ? 1 : 0.15;
		for (let i = 0; i < count; i++) {
			pos[i * 3 + 1] += speeds[i] * rate;
			if (pos[i * 3 + 1] > 4.5) pos[i * 3 + 1] = -4.5;
		}
		ref.current.geometry.attributes.position.needsUpdate = true;
	});

	return (
		<points ref={ref}>
			<bufferGeometry>
				<bufferAttribute
					attach="attributes-position"
					args={[positions, 3]}
				/>
			</bufferGeometry>
			<pointsMaterial
				size={0.06}
				color={color}
				transparent
				opacity={0.45}
				sizeAttenuation
			/>
		</points>
	);
}

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

	// Keep ref in sync
	useEffect(() => {
		st.current.activeDeck = activeDeck;
		st.current.deckAId = deckAId;
		st.current.deckBId = deckBId;
		st.current.allItems = allItems;
	});

	// Derived: which ID is on which deck
	const activeId = activeDeck === 'A' ? deckAId : deckBId;
	const currentIdx = activeId ? allItems.indexOf(activeId) : -1;

	// ── Load YT IFrame API ──────────────────────────────────────────────────
	useEffect(() => {
		if ((window as any).YT?.Player) {
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

	// ── Read Starlight accent color for R3F ────────────────────────────────
	useEffect(() => {
		const c = getComputedStyle(document.documentElement)
			.getPropertyValue('--sl-color-accent')
			.trim();
		if (c) setAccentColor(c);
	}, []);

	// ── Transition: swap decks ──────────────────────────────────────────────
	const triggerTransition = useCallback((incomingId?: string) => {
		const s = st.current;
		if (s.transitioning) return;

		const incomingPlayer =
			s.activeDeck === 'A' ? playerB.current : playerA.current;
		const id = incomingId ?? (s.activeDeck === 'A' ? s.deckBId : s.deckAId);
		if (!id) return;

		s.transitioning = true;
		setTransitioning(true);

		// Start playing incoming deck
		incomingPlayer?.unMute();
		incomingPlayer?.playVideo();

		setTimeout(() => {
			setActiveDeck((prev) => {
				const next = prev === 'A' ? 'B' : 'A';
				const inactivePlayer =
					prev === 'A' ? playerA.current : playerB.current;

				// Cue next-next into the now-idle deck
				const items = s.allItems;
				const nowPlayingIdx = items.indexOf(
					prev === 'A' ? (s.deckBId ?? '') : (s.deckAId ?? ''),
				);
				const nextNextId =
					nowPlayingIdx >= 0 && nowPlayingIdx + 1 < items.length
						? items[nowPlayingIdx + 1]
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
			// Find the genre that has this track
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

		// Update URL param
		if (firstId) {
			const url = new URL(window.location.href);
			url.searchParams.set('yt', firstId);
			window.history.replaceState({}, '', url.toString());
		}

		// Deck A: plays immediately
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
				onStateChange: (e) => {
					if (e.data === 1) setPlaying(true);
					if (e.data === 2) setPlaying(false);
					if (e.data === 0) {
						// Video ended — auto-advance
						if (!st.current.transitioning) triggerTransition();
					}
				},
			},
		});

		// Deck B: preloaded, muted, not playing
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
	}, [ytReady]);

	// ── Manual track select ─────────────────────────────────────────────────
	const playTrack = useCallback((ytId: string) => {
		const s = st.current;
		const activePlayer =
			s.activeDeck === 'A' ? playerA.current : playerB.current;
		const nextPlayer =
			s.activeDeck === 'A' ? playerB.current : playerA.current;

		// Load on active deck
		activePlayer?.loadVideoById(ytId);
		setPlaying(true);

		if (s.activeDeck === 'A') setDeckAId(ytId);
		else setDeckBId(ytId);

		// Preload the next track on the other deck
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

	// ── Deck visual styles (flex-grow animates) ─────────────────────────────
	const deckStyle = (deck: 'A' | 'B') => {
		const isActive = deck === activeDeck;
		return {
			flexGrow: isActive ? 1.7 : 1,
			flexBasis: 0,
			minWidth: 0,
			opacity: isActive ? 1 : 0.65,
			transform: isActive ? 'scale(1)' : 'scale(0.97)',
			transition:
				'flex-grow 0.65s cubic-bezier(.4,0,.2,1), opacity 0.65s ease, transform 0.65s ease',
			position: 'relative' as const,
			overflow: 'hidden' as const,
			borderRadius: '8px',
		};
	};

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
						{/* R3F overlay on active deck */}
						{activeDeck === 'A' && (
							<div
								className="absolute inset-0"
								style={{ pointerEvents: 'none' }}>
								<Canvas
									style={{ background: 'transparent' }}
									camera={{ position: [0, 0, 5], fov: 50 }}>
									<AmbientParticles
										color={accentColor}
										playing={playing}
									/>
								</Canvas>
							</div>
						)}
						{/* Deck label */}
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
						{/* R3F overlay on active deck */}
						{activeDeck === 'B' && (
							<div
								className="absolute inset-0"
								style={{ pointerEvents: 'none' }}>
								<Canvas
									style={{ background: 'transparent' }}
									camera={{ position: [0, 0, 5], fov: 50 }}>
									<AmbientParticles
										color={accentColor}
										playing={playing}
									/>
								</Canvas>
							</div>
						)}
						{/* Next label on inactive deck */}
						{activeDeck === 'A' && (
							<div
								className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded font-mono tracking-widest"
								style={{
									background:
										'var(--sl-color-accent-low, rgba(0,0,0,.5))',
									color: 'var(--sl-color-text-accent)',
								}}>
								NEXT
							</div>
						)}
						{activeDeck === 'B' && (
							<div
								className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded font-mono tracking-widest"
								style={{
									background:
										'var(--sl-color-accent-low, rgba(0,0,0,.5))',
									color: 'var(--sl-color-accent-high, #a78bfa)',
								}}>
								▶ DECK B
							</div>
						)}
						{activeDeck === 'A' && deckBId && (
							<div
								className="absolute bottom-2 left-2 text-[10px] px-2 py-0.5 rounded font-mono"
								style={{
									background: 'rgba(0,0,0,.5)',
									color: 'var(--sl-color-text-accent)',
								}}>
								{deckBId}
							</div>
						)}
					</div>
				</div>

				{/* Controls bar */}
				<div
					className="flex items-center gap-3 px-4 py-2 flex-shrink-0"
					style={{
						borderTop: '1px solid var(--sl-color-hairline)',
						borderBottom: '1px solid var(--sl-color-hairline)',
						background:
							'var(--sl-color-bg-nav, rgba(255,255,255,.03))',
					}}>
					<button
						onClick={() =>
							currentIdx > 0 &&
							playTrack(allItems[currentIdx - 1])
						}
						disabled={currentIdx <= 0}
						className="px-3 py-1 rounded text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
						style={{
							background: 'var(--sl-color-bg-nav)',
							color: 'var(--sl-color-text)',
							border: '1px solid var(--sl-color-hairline)',
						}}>
						◀ Prev
					</button>
					<span
						className="flex-1 font-mono text-xs truncate"
						style={{ color: 'var(--sl-color-gray-3, #808090)' }}>
						{activeId ?? '—'}
					</span>
					<button
						onClick={() => triggerTransition()}
						disabled={
							transitioning || currentIdx >= allItems.length - 1
						}
						className="px-3 py-1 rounded text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
						style={{
							background:
								'var(--sl-color-accent-low, rgba(167,139,250,.15))',
							color: 'var(--sl-color-accent-high, #a78bfa)',
							border: '1px solid var(--sl-color-accent)',
						}}>
						{transitioning ? '⟳ mixing…' : 'Next ▶'}
					</button>
				</div>

				{/* Track list */}
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
													id ===
													(activeDeck === 'A'
														? deckBId
														: deckAId)
														? 0.6
														: 1,
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
											{id ===
												(activeDeck === 'A'
													? deckBId
													: deckAId) && (
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
												▶
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
