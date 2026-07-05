import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
	$playerState,
	$hostStatus,
	$lastError,
	VibeshineSession,
	fetchHostStatus,
} from './vibeshineService';

const STATE_LABEL: Record<string, string> = {
	idle: 'Ready',
	'auth-required': 'Sign in required',
	checking: 'Checking host…',
	'host-offline': 'Host offline',
	signaling: 'Negotiating session…',
	connecting: 'Connecting media…',
	streaming: 'Streaming',
	error: 'Error',
};

export default function ReactVibeshinePlayer() {
	const state = useStore($playerState);
	const hostStatus = useStore($hostStatus);
	const lastError = useStore($lastError);
	const videoRef = useRef<HTMLVideoElement>(null);
	const [session] = useState(() => new VibeshineSession());

	useEffect(() => {
		void fetchHostStatus();
		return () => {
			void session.stop();
		};
	}, [session]);

	const busy =
		state === 'checking' || state === 'signaling' || state === 'connecting';
	const streaming = state === 'streaming';

	return (
		<div className="vibeshine-player">
			<div className="vibeshine-player__stage">
				<video
					ref={videoRef}
					playsInline
					autoPlay
					muted={false}
					className="vibeshine-player__video"
				/>
				{!streaming && (
					<div className="vibeshine-player__overlay">
						<p>{STATE_LABEL[state] ?? state}</p>
						{state === 'error' && lastError && (
							<p className="vibeshine-player__error">
								{lastError}
							</p>
						)}
						{hostStatus && (
							<p className="vibeshine-player__meta">
								host:{' '}
								{hostStatus.reachable
									? `up (${hostStatus.latency_ms ?? '?'} ms via tunnel)`
									: 'unreachable'}
							</p>
						)}
					</div>
				)}
			</div>
			<div className="vibeshine-player__controls">
				{!streaming ? (
					<button
						type="button"
						disabled={busy}
						onClick={() => {
							if (videoRef.current) {
								void session.start(videoRef.current);
							}
						}}>
						{busy ? 'Connecting…' : 'Connect'}
					</button>
				) : (
					<button
						type="button"
						onClick={() => {
							void session.stop();
						}}>
						Disconnect
					</button>
				)}
				<button
					type="button"
					disabled={busy}
					onClick={() => {
						void fetchHostStatus();
					}}>
					Refresh status
				</button>
			</div>
		</div>
	);
}
