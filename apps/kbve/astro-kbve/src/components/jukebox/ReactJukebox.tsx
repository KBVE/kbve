import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
	SkipBack,
	Rewind,
	Play,
	Pause,
	FastForward,
	SkipForward,
	Volume2,
	CloudRain,
	Waves,
	X,
} from 'lucide-react';

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
type AmbientMode = 'off' | 'rain' | 'ocean';

// ─── Ambient effect GLSL ──────────────────────────────────────────────────────
// Vertex shader bypasses camera — clip-space fill
const ambientVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Rain: 3 layered falling streak fields with slight wind tilt
const rainFrag = /* glsl */ `
  uniform float uTime;
  uniform vec3  uColor;
  uniform float uIntensity;
  varying vec2  vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.545); }

  void main() {
    vec3  col   = mix(vec3(0.5, 0.75, 1.0), uColor, 0.2);
    float total = 0.0;

    for (int i = 0; i < 3; i++) {
      float fi    = float(i);
      float cols  = 35.0 + fi * 22.0;
      float speed = 1.1  + fi * 0.55;
      float len   = 0.09 - fi * 0.02;
      float dim   = 0.75 - fi * 0.18;

      // Slight wind tilt
      vec2 uv2 = vec2(vUv.x + vUv.y * 0.07, vUv.y);

      float cx    = floor(uv2.x * cols);
      float phase = hash(vec2(cx, fi * 3.7 + 1.0));
      float t     = fract(uTime * speed + phase);

      float dx    = fract(uv2.x * cols) - 0.5;
      float dy    = uv2.y - t;

      // Streak: tail fading behind the drop tip
      float streak = smoothstep(-len, 0.0, dy) * smoothstep(0.006, 0.0, dy);
      // Narrow horizontal profile
      float xMask  = smoothstep(0.18, 0.0, abs(dx));

      total += streak * xMask * dim;
    }

    gl_FragColor = vec4(col, clamp(total, 0.0, 1.0) * uIntensity * 0.72);
  }
`;

// Ocean: layered sine waves with foam crests and sparkle highlights
const oceanFrag = /* glsl */ `
  uniform float uTime;
  uniform vec3  uColor;
  uniform float uIntensity;
  varying vec2  vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.545); }

  void main() {
    vec3  oceanCol = mix(vec3(0.0, 0.22, 0.5),  uColor, 0.15);
    vec3  foamCol  = mix(vec3(0.75, 0.9, 1.0), uColor, 0.1);
    float total    = 0.0;
    vec3  color    = vec3(0.0);

    for (int i = 0; i < 5; i++) {
      float fi    = float(i);
      float freq  = 2.0 + fi * 1.2;
      float speed = 0.18 + fi * 0.05;
      float amp   = 0.038 - fi * 0.005;
      float baseY = 0.18 + fi * 0.16;

      float wave  = amp * sin(vUv.x * freq * 6.2832 + uTime * speed)
                  + amp * 0.4 * sin(vUv.x * freq * 1.7 * 6.2832 - uTime * speed * 0.8 + fi);

      float waveY = baseY + wave;
      float dist  = vUv.y - waveY;

      // Foam crest
      float foam = smoothstep(0.013, 0.0, abs(dist)) * 1.3;
      // Water fill below crest
      float fill = smoothstep(0.0, -0.11, dist) * 0.28;
      float lum  = 0.85 - fi * 0.12;

      total += (foam + fill) * lum;
      color += (foamCol * foam + oceanCol * fill) * lum;
    }

    // Random foam sparkles
    float sp = step(0.964, hash(floor(vUv * vec2(80.0, 50.0)) + vec2(floor(uTime * 6.0), 0.0)));
    color  += vec3(0.88, 0.95, 1.0) * sp;
    total  += sp * 0.5;

    vec3 finalCol = total > 0.001 ? color / total : oceanCol;
    gl_FragColor  = vec4(finalCol, clamp(total, 0.0, 1.0) * uIntensity * 0.58);
  }
`;

// ─── R3F ambient effect mesh ──────────────────────────────────────────────────
const fragByMode: Record<Exclude<AmbientMode, 'off'>, string> = {
	rain: rainFrag,
	ocean: oceanFrag,
};

function AmbientEffect({
	mode,
	color,
}: {
	mode: Exclude<AmbientMode, 'off'>;
	color: string;
}) {
	const uniforms = useRef({
		uTime: { value: 0 },
		uColor: { value: new THREE.Color(color) },
		uIntensity: { value: 0.0 },
	});

	const mat = useMemo(
		() =>
			new THREE.ShaderMaterial({
				uniforms: uniforms.current,
				vertexShader: ambientVert,
				fragmentShader: fragByMode[mode],
				transparent: true,
				depthWrite: false,
			}),
		[mode],
	);

	useEffect(() => () => mat.dispose(), [mat]);

	useFrame(({ clock }) => {
		uniforms.current.uTime.value = clock.elapsedTime;
		uniforms.current.uColor.value.set(color);
		uniforms.current.uIntensity.value = THREE.MathUtils.lerp(
			uniforms.current.uIntensity.value,
			1.0,
			0.05,
		);
	});

	return (
		<mesh>
			<planeGeometry args={[2, 2]} />
			<primitive object={mat} attach="material" />
		</mesh>
	);
}

// ─── Web Audio ambient synthesis ──────────────────────────────────────────────
// No audio files needed — synthesized via AudioContext
function useAmbientAudio(mode: AmbientMode, volume: number) {
	const ctxRef = useRef<AudioContext | null>(null);
	const nodesRef = useRef<AudioNode[]>([]);

	const stop = useCallback(() => {
		nodesRef.current.forEach((n) => {
			try {
				(n as AudioScheduledSourceNode).stop?.();
			} catch {}
		});
		nodesRef.current = [];
	}, []);

	useEffect(() => {
		stop();
		if (mode === 'off') return;

		const ctx = ctxRef.current ?? (ctxRef.current = new AudioContext());
		if (ctx.state === 'suspended') ctx.resume();

		const gain = ctx.createGain();
		gain.gain.value = (volume / 100) * 0.25;
		gain.connect(ctx.destination);

		if (mode === 'rain') {
			// White noise through a bandpass — sounds like rainfall
			const bufSize = ctx.sampleRate * 2;
			const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
			const data = buf.getChannelData(0);
			for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

			const src = ctx.createBufferSource();
			src.buffer = buf;
			src.loop = true;

			const bp = ctx.createBiquadFilter();
			bp.type = 'bandpass';
			bp.frequency.value = 1200;
			bp.Q.value = 0.5;

			src.connect(bp);
			bp.connect(gain);
			src.start();
			nodesRef.current = [src, bp, gain];
		} else if (mode === 'ocean') {
			// Low-freq modulated noise — ocean swell
			const bufSize = ctx.sampleRate * 4;
			const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
			const data = buf.getChannelData(0);
			for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

			const src = ctx.createBufferSource();
			src.buffer = buf;
			src.loop = true;

			const lp = ctx.createBiquadFilter();
			lp.type = 'lowpass';
			lp.frequency.value = 400;
			lp.Q.value = 0.8;

			// LFO for wave-like swell
			const lfo = ctx.createOscillator();
			lfo.frequency.value = 0.12;
			const lfoGain = ctx.createGain();
			lfoGain.gain.value = 0.3;
			lfo.connect(lfoGain);
			lfoGain.connect(gain.gain);

			src.connect(lp);
			lp.connect(gain);
			lfo.start();
			src.start();
			nodesRef.current = [src, lp, lfo, lfoGain, gain];
		}

		return stop;
	}, [mode, stop]);

	// Live volume update without restarting
	useEffect(() => {
		const gainNode = nodesRef.current.find((n) => n instanceof GainNode) as
			| GainNode
			| undefined;
		if (gainNode) gainNode.gain.value = (volume / 100) * 0.25;
	}, [volume]);

	// Cleanup on unmount
	useEffect(
		() => () => {
			stop();
			ctxRef.current?.close();
		},
		[stop],
	);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(s: number) {
	if (!s || !isFinite(s)) return '0:00';
	const m = Math.floor(s / 60);
	return `${m}:${Math.floor(s % 60)
		.toString()
		.padStart(2, '0')}`;
}

const btnBase: React.CSSProperties = {
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center',
	padding: '5px 8px',
	borderRadius: '6px',
	cursor: 'pointer',
	background: 'var(--sl-color-bg-nav)',
	color: 'var(--sl-color-text)',
	border: '1px solid var(--sl-color-hairline)',
	transition: 'opacity 0.15s',
	flexShrink: 0,
};
const btnAccent: React.CSSProperties = {
	...btnBase,
	background: 'var(--sl-color-accent-low)',
	color: 'var(--sl-color-accent-high)',
	border: '1px solid var(--sl-color-accent)',
};

// ─── Main component ────────────────────────────────────────────────────────────
export default function ReactJukebox({ genres }: Props) {
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
	// pixelFactor: 1 = normal, 2–8 = actual CSS-scale pixelation of the iframe
	const [pixelFactor, setPixelFactor] = useState(1);
	const [ambientMode, setAmbientMode] = useState<AmbientMode>('off');

	const deckAEl = useRef<HTMLDivElement>(null!);
	const deckBEl = useRef<HTMLDivElement>(null!);
	const playerA = useRef<YTPlayer | null>(null);
	const playerB = useRef<YTPlayer | null>(null);

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

	useEffect(() => {
		st.current.activeDeck = activeDeck;
		st.current.deckAId = deckAId;
		st.current.deckBId = deckBId;
		st.current.allItems = allItems;
	});

	const activeId = activeDeck === 'A' ? deckAId : deckBId;
	const inactiveId = activeDeck === 'A' ? deckBId : deckAId;
	const currentIdx = activeId ? allItems.indexOf(activeId) : -1;

	const getActivePlayer = useCallback(
		() =>
			st.current.activeDeck === 'A' ? playerA.current : playerB.current,
		[],
	);

	// Ambient audio synthesis
	useAmbientAudio(ambientMode, volume);

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
			} catch {}
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

	// ── Starlight accent color ─────────────────────────────────────────────
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
				onReady: (e) => e.target.setVolume(volume),
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

	// ── Transport ───────────────────────────────────────────────────────────
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

	// ── Deck styles ─────────────────────────────────────────────────────────
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
			pointerEvents: isActive ? 'auto' : 'none',
		};
	};

	// CSS scale-trick: iframe renders at 1/pixelFactor size then scales up.
	// image-rendering: pixelated requests nearest-neighbour compositing.
	const pixelWrapStyle = (factor: number): React.CSSProperties => ({
		position: 'absolute',
		top: 0,
		left: 0,
		width: `${100 / factor}%`,
		height: `${100 / factor}%`,
		transform: `scale(${factor})`,
		transformOrigin: 'top left',
		imageRendering: factor > 1 ? 'pixelated' : 'auto',
	});

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
										? 'var(--sl-color-accent-low)'
										: 'transparent',
								color:
									g.slug === genreSlug
										? 'var(--sl-color-accent-high)'
										: 'var(--sl-color-text)',
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
				{/* Deck area + ambient canvas */}
				<div
					className="relative flex gap-2 p-2"
					style={{ flex: '0 0 48%', overflow: 'hidden' }}>
					{/* Deck A */}
					<div style={deckStyle('A')}>
						{/* CSS pixel scale wrapper — real iframe pixelation */}
						<div
							style={{
								position: 'absolute',
								inset: 0,
								overflow: 'hidden',
							}}>
							<div style={pixelWrapStyle(pixelFactor)}>
								<div
									ref={deckAEl}
									style={{ width: '100%', height: '100%' }}
								/>
							</div>
						</div>
						<div
							className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded font-mono tracking-widest"
							style={{
								background: 'var(--sl-color-accent-low)',
								color: 'var(--sl-color-accent-high)',
								pointerEvents: 'none',
							}}>
							{activeDeck === 'A' ? '▶ DECK A' : '⏸ DECK A'}
						</div>
					</div>

					{/* Deck B — narrow preview */}
					<div style={deckStyle('B')}>
						<div
							style={{
								position: 'absolute',
								inset: 0,
								overflow: 'hidden',
							}}>
							<div style={pixelWrapStyle(pixelFactor)}>
								<div
									ref={deckBEl}
									style={{ width: '100%', height: '100%' }}
								/>
							</div>
						</div>
						{activeDeck === 'A' ? (
							<div
								className="absolute inset-0 flex items-end justify-center pb-3"
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
						) : (
							<div
								className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded font-mono tracking-widest"
								style={{
									background: 'var(--sl-color-accent-low)',
									color: 'var(--sl-color-accent-high)',
									pointerEvents: 'none',
								}}>
								▶ DECK B
							</div>
						)}
					</div>

					{/* Ambient FX canvas — spans the entire deck area, above video */}
					{ambientMode !== 'off' && (
						<div
							className="absolute inset-0"
							style={{ pointerEvents: 'none', zIndex: 10 }}>
							<Canvas
								key={ambientMode}
								style={{ background: 'transparent' }}>
								<AmbientEffect
									mode={ambientMode}
									color={accentColor}
								/>
							</Canvas>
						</div>
					)}
				</div>

				{/* ── Controls ────────────────────────────────────────── */}
				<div
					className="flex flex-col gap-2 px-4 py-2 flex-shrink-0"
					style={{
						borderTop: '1px solid var(--sl-color-hairline)',
						borderBottom: '1px solid var(--sl-color-hairline)',
						background: 'var(--sl-color-bg-nav)',
					}}>
					{/* Progress bar */}
					<div className="flex items-center gap-2">
						<span
							className="text-[10px] font-mono w-8 text-right flex-shrink-0"
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
							className="flex-1"
							style={{ accentColor: 'var(--sl-color-accent)' }}
						/>
						<span
							className="text-[10px] font-mono w-8 flex-shrink-0"
							style={{ color: 'var(--sl-color-gray-3)' }}>
							{fmt(duration)}
						</span>
					</div>

					{/* Transport + pixel + ambient + volume */}
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
							title="Previous">
							<SkipBack size={14} />
						</button>
						<button
							onClick={rewind}
							style={btnBase}
							title="Back 10s">
							<Rewind size={14} />
						</button>
						<button
							onClick={togglePlay}
							style={{ ...btnAccent, padding: '6px 12px' }}
							title={playing ? 'Pause' : 'Play'}>
							{playing ? <Pause size={16} /> : <Play size={16} />}
						</button>
						<button
							onClick={forward}
							style={btnBase}
							title="Forward 10s">
							<FastForward size={14} />
						</button>
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
							title="Next (DJ mix)">
							<SkipForward size={14} />
						</button>

						{/* Track label */}
						<span
							className="flex-1 font-mono text-[10px] truncate px-1 min-w-0"
							style={{ color: 'var(--sl-color-gray-3)' }}>
							{activeId ?? '—'}
						</span>

						{/* Pixel factor knob — controls CSS iframe scale-down */}
						<span
							className="text-[9px] font-mono flex-shrink-0"
							style={{ color: 'var(--sl-color-gray-4)' }}>
							PX
						</span>
						<input
							type="range"
							min={1}
							max={8}
							step={1}
							value={pixelFactor}
							onChange={(e) =>
								setPixelFactor(parseInt(e.target.value))
							}
							className="w-14"
							title={`Pixel size: ${pixelFactor}×`}
							style={{ accentColor: 'var(--sl-color-accent)' }}
						/>

						{/* Ambient FX buttons */}
						<span
							className="text-[9px] font-mono flex-shrink-0"
							style={{ color: 'var(--sl-color-gray-4)' }}>
							FX
						</span>
						{(
							[
								{ mode: 'off', icon: <X size={12} /> },
								{
									mode: 'rain',
									icon: <CloudRain size={12} />,
								},
								{ mode: 'ocean', icon: <Waves size={12} /> },
							] as const
						).map(({ mode, icon }) => (
							<button
								key={mode}
								onClick={() => setAmbientMode(mode)}
								style={
									ambientMode === mode ? btnAccent : btnBase
								}
								title={
									mode === 'off'
										? 'No FX'
										: mode === 'rain'
											? 'Rain'
											: 'Ocean waves'
								}>
								{icon}
							</button>
						))}

						{/* Volume */}
						<Volume2
							size={14}
							style={{
								color: 'var(--sl-color-gray-3)',
								flexShrink: 0,
							}}
						/>
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
											color: 'var(--sl-color-gray-4)',
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
														? 'var(--sl-color-accent-low)'
														: 'transparent',
												color:
													id === activeId
														? 'var(--sl-color-accent-high)'
														: 'var(--sl-color-text)',
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
											color: 'var(--sl-color-gray-4)',
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
