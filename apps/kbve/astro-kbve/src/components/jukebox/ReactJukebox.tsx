import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
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
	Cloud,
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
type AmbientMode = 'off' | 'rain' | 'ocean' | 'clouds';

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

// Cloud shader — adapted from mrdoob's example.
// Uses iResolution + iTime uniforms; outputs sky+cloud colour with alpha mask
// so it overlays as a semi-transparent layer over the video.
const cloudFrag = /* glsl */ `
  precision highp float;
  uniform vec2  iResolution;
  uniform float iTime;
  uniform float uIntensity;

  vec3 hsv2rgb(float h, float s, float v) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(vec3(h) + K.xyz) * 6.0 - K.www);
    return v * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), s);
  }

  void main() {
    vec2 FC = gl_FragCoord.xy;
    vec2 r  = iResolution.xy;

    vec3 d = vec3((FC.x - 0.5*r.x) / r.x,
                  (FC.y - 0.5*r.y) / r.y,
                  0.57);
    d.y -= 0.28;
    d.x -= 0.12;

    float a  = sin(iTime * 0.055) * 0.5;
    float ca = cos(a), sa = sin(a);
    d.xz = mat2(ca, -sa, sa, ca) * d.xz;

    float e = 0.0, g = 0.0, R = 0.0, s = 0.0;
    vec3 q = vec3(0.0, -1.0, -1.0);
    vec3 p;
    vec4 o = vec4(0.0);

    for (float i = 1.0; i <= 79.0; i++) {
      o.rgb -= hsv2rgb(0.58, R + g * 0.18, e - e * i / 4.5);
      s = 2.8;
      q += d * e * R * 0.6;
      p  = q;
      g += p.y / s;

      float oldPx = p.x;
      R = length(p);
      float newPy = exp2(mod(-0.25 - p.z, s) / R);
      p = vec3(R, newPy, oldPx);
      p.y -= 1.0;
      e    = p.y;

      float tOff = iTime * 0.08;
      for (s = 2.8; s < 1000.0; s += s) {
        e -= abs(dot(sin(p.xzy * s + e * p.y + tOff),
                     cos(p.zzz * s - e       + tOff)) / s * 0.32);
      }
    }

    vec3 col = clamp(-o.rgb, 0.0, 1.0);
    col = pow(col, vec3(0.4545));
    float lum = dot(col, vec3(0.299, 0.587, 0.114));

    float c = clamp((lum - 0.02) / 0.75, 0.0, 1.0);
    c = pow(c, 0.5);

    vec3 shadow    = vec3(0.62, 0.70, 0.78);
    vec3 highlight = vec3(0.99, 0.97, 0.91);
    vec3 cloudCol  = mix(shadow, highlight, c);
    vec3 sky       = vec3(0.53, 0.78, 0.90);
    float mask     = clamp(c * 4.0, 0.0, 1.0);
    vec3 finalCol  = mix(sky, cloudCol, mask);

    // Use cloud density as alpha so video shows through thin areas
    gl_FragColor = vec4(finalCol, clamp(lum * 1.4, 0.0, 1.0) * uIntensity * 0.72);
  }
`;

// Cloud shader needs iResolution — use a wrapper that injects canvas size
const cloudVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// ─── R3F ambient effect mesh ──────────────────────────────────────────────────
const fragByMode: Record<Exclude<AmbientMode, 'off'>, string> = {
	rain: rainFrag,
	ocean: oceanFrag,
	clouds: cloudFrag,
};

function AmbientEffect({
	mode,
	color,
}: {
	mode: Exclude<AmbientMode, 'off'>;
	color: string;
}) {
	const { size } = useThree();

	const uniforms = useRef({
		uTime: { value: 0 },
		uColor: { value: new THREE.Color(color) },
		uIntensity: { value: 0.0 },
		// Cloud shader extras (ignored by rain/ocean)
		iResolution: {
			value: new THREE.Vector2(size.width, size.height),
		},
	});

	// Use the right vertex shader for clouds (needs vUv-less path)
	const vert = mode === 'clouds' ? cloudVert : ambientVert;

	const mat = useMemo(
		() =>
			new THREE.ShaderMaterial({
				uniforms: uniforms.current,
				vertexShader: vert,
				fragmentShader: fragByMode[mode],
				transparent: true,
				depthWrite: false,
			}),
		[mode, vert],
	);

	useEffect(() => () => mat.dispose(), [mat]);

	useFrame(({ clock }) => {
		uniforms.current.uTime.value = clock.elapsedTime;
		uniforms.current.uColor.value.set(color);
		uniforms.current.iResolution.value.set(size.width, size.height);
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

// ─── Custom tooltip ───────────────────────────────────────────────────────────
function Tooltip({
	text,
	children,
}: {
	text: string;
	children: React.ReactNode;
}) {
	const [visible, setVisible] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const show = () => {
		timer.current = setTimeout(() => setVisible(true), 250);
	};
	const hide = () => {
		if (timer.current) clearTimeout(timer.current);
		setVisible(false);
	};

	return (
		<div
			style={{ position: 'relative', display: 'inline-flex' }}
			onMouseEnter={show}
			onMouseLeave={hide}>
			{children}
			{visible && (
				<div
					style={{
						position: 'absolute',
						bottom: 'calc(100% + 7px)',
						left: '50%',
						transform: 'translateX(-50%)',
						whiteSpace: 'nowrap',
						padding: '3px 9px',
						borderRadius: '5px',
						fontSize: '11px',
						lineHeight: '1.4',
						pointerEvents: 'none',
						zIndex: 9999,
						background: 'var(--sl-color-bg-nav)',
						color: 'var(--sl-color-text)',
						border: '1px solid var(--sl-color-hairline)',
						boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
					}}>
					{text}
					<span
						style={{
							position: 'absolute',
							top: '100%',
							left: '50%',
							transform: 'translateX(-50%)',
							width: 0,
							height: 0,
							borderLeft: '5px solid transparent',
							borderRight: '5px solid transparent',
							borderTop: '5px solid var(--sl-color-hairline)',
						}}
					/>
				</div>
			)}
		</div>
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
	// Track titles fetched from YouTube oEmbed (no API key needed)
	const [titles, setTitles] = useState<Record<string, string>>({});
	const fetchedIds = useRef<Set<string>>(new Set());

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

	// ── Fetch track titles via YouTube oEmbed (no API key, CORS-enabled) ───
	useEffect(() => {
		const ids = [...(genre?.tracks ?? []), ...(genre?.sets ?? [])].filter(
			(id) => !fetchedIds.current.has(id),
		);
		if (!ids.length) return;

		// Mark as in-flight immediately to prevent duplicate requests
		ids.forEach((id) => fetchedIds.current.add(id));

		Promise.all(
			ids.map(async (id) => {
				try {
					const res = await fetch(
						`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`,
					);
					if (!res.ok) return null;
					const data = (await res.json()) as { title: string };
					return [id, data.title] as const;
				} catch {
					return null;
				}
			}),
		).then((results) => {
			const next: Record<string, string> = {};
			for (const r of results) if (r) next[r[0]] = r[1];
			if (Object.keys(next).length)
				setTitles((prev) => ({ ...prev, ...next }));
		});
	}, [genre?.slug]); // refetch when genre changes

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
			className="not-content flex h-full overflow-hidden"
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
						<Tooltip text="Previous track">
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
										currentIdx <= 0
											? 'not-allowed'
											: 'pointer',
								}}>
								<SkipBack size={14} />
							</button>
						</Tooltip>
						<Tooltip text="Back 10s">
							<button onClick={rewind} style={btnBase}>
								<Rewind size={14} />
							</button>
						</Tooltip>
						<Tooltip text={playing ? 'Pause' : 'Play'}>
							<button
								onClick={togglePlay}
								style={{ ...btnAccent, padding: '6px 12px' }}>
								{playing ? (
									<Pause size={16} />
								) : (
									<Play size={16} />
								)}
							</button>
						</Tooltip>
						<Tooltip text="Forward 10s">
							<button onClick={forward} style={btnBase}>
								<FastForward size={14} />
							</button>
						</Tooltip>
						<Tooltip text="Next track (DJ mix)">
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
								}}>
								<SkipForward size={14} />
							</button>
						</Tooltip>

						{/* Now playing — shows fetched title if available */}
						<span
							className="flex-1 text-[10px] truncate px-1 min-w-0"
							style={{ color: 'var(--sl-color-gray-3)' }}>
							{activeId ? (titles[activeId] ?? activeId) : '—'}
						</span>

						{/* Pixel factor knob */}
						<Tooltip text={`Pixel size: ${pixelFactor}×`}>
							<span
								className="text-[9px] font-mono flex-shrink-0 cursor-default"
								style={{ color: 'var(--sl-color-gray-4)' }}>
								PX
							</span>
						</Tooltip>
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
								{
									mode: 'off' as const,
									icon: <X size={12} />,
									label: 'No ambient FX',
								},
								{
									mode: 'rain' as const,
									icon: <CloudRain size={12} />,
									label: 'Rain — visual + audio',
								},
								{
									mode: 'ocean' as const,
									icon: <Waves size={12} />,
									label: 'Ocean waves — visual + audio',
								},
								{
									mode: 'clouds' as const,
									icon: <Cloud size={12} />,
									label: 'Clouds — volumetric shader',
								},
							] as const
						).map(({ mode, icon, label }) => (
							<Tooltip key={mode} text={label}>
								<button
									onClick={() => setAmbientMode(mode)}
									style={
										ambientMode === mode
											? btnAccent
											: btnBase
									}>
									{icon}
								</button>
							</Tooltip>
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
											<span className="text-xs truncate">
												{titles[id] ?? id}
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
											<span className="text-xs truncate">
												{titles[id] ?? id}
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
