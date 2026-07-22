import { listen } from '@tauri-apps/api/event';
import React, { useEffect, useRef, useState } from 'react';
import './RecordingOverlay.css';
import { commands } from '../bindings';

type OverlayState = 'recording' | 'transcribing';

const MicrophoneIcon = () => (
	<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
		<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
		<path d="M19 10v2a7 7 0 0 1-14 0v-2" />
		<line x1="12" y1="19" x2="12" y2="23" />
	</svg>
);

const TranscriptionIcon = () => (
	<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
		<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
		<polyline points="14 2 14 8 20 8" />
		<line x1="8" y1="13" x2="16" y2="13" />
		<line x1="8" y1="17" x2="13" y2="17" />
	</svg>
);

const CancelIcon = () => (
	<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
		<line x1="18" y1="6" x2="6" y2="18" />
		<line x1="6" y1="6" x2="18" y2="18" />
	</svg>
);

const RecordingOverlay: React.FC = () => {
	const [isVisible, setIsVisible] = useState(false);
	const [state, setState] = useState<OverlayState>('recording');
	const [levels, setLevels] = useState<number[]>(Array(16).fill(0));
	const smoothedLevelsRef = useRef<number[]>(Array(16).fill(0));

	useEffect(() => {
		const setup = async () => {
			const unlistenShow = await listen('show-overlay', (event) => {
				setState(event.payload as OverlayState);
				setIsVisible(true);
			});
			const unlistenHide = await listen('hide-overlay', () => {
				setIsVisible(false);
			});
			const unlistenLevel = await listen<number[]>('mic-level', (event) => {
				const newLevels = event.payload as number[];
				const smoothed = smoothedLevelsRef.current.map((prev, i) => {
					const target = newLevels[i] || 0;
					return prev * 0.7 + target * 0.3;
				});
				smoothedLevelsRef.current = smoothed;
				setLevels(smoothed.slice(0, 9));
			});
			return () => {
				unlistenShow();
				unlistenHide();
				unlistenLevel();
			};
		};
		const cleanup = setup();
		return () => {
			cleanup.then((f) => f && f());
		};
	}, []);

	return (
		<div className={`recording-overlay ${isVisible ? 'fade-in' : ''}`}>
			<div className="overlay-left">
				{state === 'recording' ? <MicrophoneIcon /> : <TranscriptionIcon />}
			</div>

			<div className="overlay-middle">
				{state === 'recording' && (
					<div className="bars-container">
						{levels.map((v, i) => (
							<div
								key={i}
								className="bar"
								style={{
									height: `${Math.min(20, 4 + Math.pow(v, 0.7) * 16)}px`,
									transition:
										'height 60ms ease-out, opacity 120ms ease-out',
									opacity: Math.max(0.2, v * 1.7),
								}}
							/>
						))}
					</div>
				)}
				{state === 'transcribing' && (
					<div className="transcribing-text">Transcribing…</div>
				)}
			</div>

			<div className="overlay-right">
				{state === 'recording' && (
					<div
						className="cancel-button"
						onClick={() => {
							commands.cancelOperation();
						}}>
						<CancelIcon />
					</div>
				)}
			</div>
		</div>
	);
};

export default RecordingOverlay;
