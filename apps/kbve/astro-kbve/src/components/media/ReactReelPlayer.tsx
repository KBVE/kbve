import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
	$reelState,
	$reelError,
	$reelName,
	$reelNotice,
	$reelSelectedId,
	ReelPlayer,
} from './reelService';

const STATE_LABEL: Record<string, string> = {
	idle: 'Ready',
	loading: 'Loading…',
	probing: 'Preparing stream…',
	raw: 'Playing',
	hls: 'Playing (HLS)',
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
	const selectedId = useStore($reelSelectedId);
	const videoRef = useRef<HTMLVideoElement>(null);
	const [player] = useState(() => new ReelPlayer());

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
		videoRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}, [selectedId, player]);

	const play = () => {
		if (videoRef.current && selectedId) {
			void player.start(videoRef.current, selectedId);
		}
	};

	const busy = state === 'loading' || state === 'probing';
	const playing = state === 'raw' || state === 'hls';

	return (
		<div className="reel-player">
			<div className="reel-player__stage">
				<video
					ref={videoRef}
					controls
					playsInline
					className="reel-player__video"
				/>
				{!playing && (
					<div className="reel-player__overlay">
						<p>{STATE_LABEL[state] ?? state}</p>
						{name && <p className="reel-player__meta">{name}</p>}
						{state === 'error' && error && (
							<p className="reel-player__error">{error}</p>
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
					<button
						type="button"
						disabled={!selectedId}
						onClick={play}>
						{state === 'error' ? 'Retry' : 'Play'}
					</button>
				</div>
			)}
		</div>
	);
}
