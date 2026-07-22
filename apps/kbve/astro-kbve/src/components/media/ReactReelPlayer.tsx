import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
	$reelState,
	$reelError,
	$reelName,
	$reelNotice,
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
	const videoRef = useRef<HTMLVideoElement>(null);
	const [player] = useState(() => new ReelPlayer());
	const [id] = useState(() => readId());

	useEffect(() => {
		return () => {
			player.stop();
		};
	}, [player]);

	const play = () => {
		if (videoRef.current && id) {
			void player.start(videoRef.current, id);
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
						{!id && (
							<p className="reel-player__error">
								No torrent selected — add ?id=&lt;id&gt; to the URL.
							</p>
						)}
					</div>
				)}
			</div>
			{notice && <p className="reel-player__notice">{notice}</p>}
			<div className="reel-player__controls">
				{state === 'error' ? (
					<button type="button" disabled={!id} onClick={play}>
						Retry
					</button>
				) : (
					<button
						type="button"
						disabled={busy || playing || !id}
						onClick={play}>
						{busy ? 'Preparing…' : 'Play'}
					</button>
				)}
			</div>
		</div>
	);
}
