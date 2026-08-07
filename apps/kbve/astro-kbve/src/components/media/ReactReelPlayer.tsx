import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
	$reelState,
	$reelError,
	$reelName,
	$reelNotice,
	$reelStatus,
	$reelSelectedId,
	ReelPlayer,
} from './reelService';

const STATE_LABEL: Record<string, string> = {
	idle: 'Ready',
	loading: 'Loading…',
	probing: 'Preparing stream…',
	raw: 'Playing',
	hls: 'Playing (HLS)',
	reconnecting: 'Reconnecting…',
	error: 'Error',
};

function readId(): string | null {
	if (typeof window === 'undefined') return null;
	return new URLSearchParams(window.location.search).get('id');
}

export default function ReactReelPlayer() {
	const state = useStore($reelState);
	const error = useStore($reelError);
	const name = useStore($reelName);
	const notice = useStore($reelNotice);
	const status = useStore($reelStatus);
	const selectedId = useStore($reelSelectedId);
	const videoRef = useRef<HTMLVideoElement>(null);
	const [player] = useState(() => new ReelPlayer());
	const [theater, setTheater] = useState(false);

	// Seed the selection from the URL so a shared /media/reel/?id=… link binds
	// the player on first load (playback still needs a tap there — no gesture).
	useEffect(() => {
		const urlId = readId();
		if (urlId) $reelSelectedId.set(urlId);
	}, []);

	useEffect(() => {
		return () => {
			player.stop();
		};
	}, [player]);

	// Autoplay whenever a reel is selected. In-page Play clicks carry the user
	// gesture through, so playback starts immediately; a cold URL load may be
	// blocked by the browser and falls back to the Play button below.
	useEffect(() => {
		if (!selectedId || !videoRef.current) return;
		void player.start(videoRef.current, selectedId);
		videoRef.current.scrollIntoView({
			behavior: 'smooth',
			block: 'center',
		});
	}, [selectedId, player]);

	// Theater mode blows the stage up to fill the window (not native fullscreen),
	// so it's easy to watch without leaving the page. Esc exits, and the page
	// behind it is scroll-locked while active.
	useEffect(() => {
		if (!theater) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setTheater(false);
		};
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('keydown', onKey);
			document.body.style.overflow = prevOverflow;
		};
	}, [theater]);

	const play = () => {
		if (videoRef.current && selectedId) {
			void player.start(videoRef.current, selectedId);
		}
	};

	const busy =
		state === 'loading' ||
		state === 'probing' ||
		state === 'reconnecting';
	const playing = state === 'raw' || state === 'hls';
	const reconnecting = state === 'reconnecting';
	// Reconnects keep the video on screen: swapping in a full-stage overlay for
	// every retry is what made a flapping stream flicker. The badge reports what
	// is happening without tearing the picture down.
	const overlay = !playing && !reconnecting;
	const badge = playing || reconnecting ? status?.message : null;

	return (
		<div className={`reel-player${theater ? ' reel-player--theater' : ''}`}>
			<div className="reel-player__stage">
				<video
					ref={videoRef}
					controls
					playsInline
					className="reel-player__video"
				/>
				{selectedId && (
					<button
						type="button"
						className="reel-player__theater-toggle"
						aria-pressed={theater}
						title={theater ? 'Exit theater (Esc)' : 'Theater mode'}
						onClick={() => setTheater((v) => !v)}>
						{theater ? '✕ Exit' : '⛶ Theater'}
					</button>
				)}
				{badge && (
					<div
						className={`reel-player__badge${reconnecting ? ' reel-player__badge--warn' : ''}`}>
						<span>{badge}</span>
						{reconnecting && status?.attempt && status?.max ? (
							<span>{`· ${status.attempt}/${status.max}`}</span>
						) : null}
					</div>
				)}
				{overlay && (
					<div className="reel-player__overlay">
						<p>{STATE_LABEL[state] ?? state}</p>
						{name && <p className="reel-player__meta">{name}</p>}
						{state === 'error' && error && (
							<p className="reel-player__error">{error}</p>
						)}
						{state !== 'error' && status?.message && (
							<p className="reel-player__meta">{status.message}</p>
						)}
						{!selectedId && (
							<p className="reel-player__meta">
								Pick a reel below to start watching.
							</p>
						)}
					</div>
				)}
			</div>
			{notice && <p className="reel-player__notice">{notice}</p>}
			{(state === 'error' || (selectedId && !playing && !busy)) && (
				<div className="reel-player__controls">
					<button type="button" disabled={!selectedId} onClick={play}>
						{state === 'error' ? 'Retry' : 'Play'}
					</button>
				</div>
			)}
		</div>
	);
}
