import { useEffect, useState, useCallback } from 'react';
import { droid, workerURLs } from '@kbve/droid';
import type { DroidScaleLevel } from '@kbve/droid';

export function ScaleTest() {
	const [initialized, setInitialized] = useState(false);
	const [scaleLevel, setScaleLevel] = useState<DroidScaleLevel | 'unknown'>(
		'unknown',
	);
	const [hasOverlay, setHasOverlay] = useState(false);
	const [hasCanvasWorker, setHasCanvasWorker] = useState(false);
	const [hasGateway, setHasGateway] = useState(false);
	const [hasWs, setHasWs] = useState(false);
	const [hasApi, setApi] = useState(false);
	const [downscaleEvent, setDownscaleEvent] = useState(false);
	const [upscaleEvent, setUpscaleEvent] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const refreshState = useCallback(() => {
		const kbve = (window as any).kbve;
		if (!kbve) return;
		setScaleLevel(
			typeof kbve.scaleLevel === 'function'
				? kbve.scaleLevel()
				: 'unknown',
		);
		setHasOverlay(!!kbve.overlay);
		setHasCanvasWorker(!!kbve.uiux?.worker);
		setHasGateway(!!kbve.gateway);
		setHasWs(!!kbve.ws);
		setApi(!!kbve.api);
	}, []);

	useEffect(() => {
		let cancelled = false;

		async function init() {
			try {
				await droid({ workerURLs, initTimeout: 10_000 });
				if (cancelled) return;

				const kbve = (window as any).kbve;

				// Listen for scale events
				kbve?.events?.on('droid-downscale', () => {
					setDownscaleEvent(true);
					refreshState();
				});
				kbve?.events?.on('droid-upscale', () => {
					setUpscaleEvent(true);
					refreshState();
				});

				setInitialized(true);
				refreshState();
			} catch (err) {
				if (cancelled) return;
				setError(err instanceof Error ? err.message : String(err));
			}
		}

		init();
		return () => {
			cancelled = true;
		};
	}, [refreshState]);

	const handleDownscale = async () => {
		try {
			const kbve = (window as any).kbve;
			await kbve?.downscale?.();
			refreshState();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	};

	const handleUpscale = async () => {
		try {
			const kbve = (window as any).kbve;
			await kbve?.upscale?.();
			refreshState();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	};

	return (
		<div
			data-testid="scale-test"
			style={{
				border: '1px solid #ccc',
				padding: '1rem',
				marginBottom: '1rem',
			}}>
			<h2>Scale Management</h2>

			<div
				data-testid="scale-initialized"
				data-value={String(initialized)}>
				Initialized: {initialized ? 'Yes' : 'No'}
			</div>

			<div data-testid="scale-level" data-value={scaleLevel}>
				Scale Level: {scaleLevel}
			</div>

			<div
				data-testid="scale-has-overlay"
				data-value={String(hasOverlay)}>
				Overlay: {hasOverlay ? 'Active' : 'Inactive'}
			</div>

			<div
				data-testid="scale-has-canvas-worker"
				data-value={String(hasCanvasWorker)}>
				Canvas Worker: {hasCanvasWorker ? 'Active' : 'Inactive'}
			</div>

			<div
				data-testid="scale-has-gateway"
				data-value={String(hasGateway)}>
				Gateway: {hasGateway ? 'Inactive' : 'Inactive'}
			</div>

			<div data-testid="scale-has-ws" data-value={String(hasWs)}>
				WS Worker: {hasWs ? 'Active' : 'Inactive'}
			</div>

			<div data-testid="scale-has-api" data-value={String(hasApi)}>
				API Worker: {hasApi ? 'Active' : 'Inactive'}
			</div>

			<div
				data-testid="scale-downscale-event"
				data-value={String(downscaleEvent)}>
				Downscale Event Fired: {downscaleEvent ? 'Yes' : 'No'}
			</div>

			<div
				data-testid="scale-upscale-event"
				data-value={String(upscaleEvent)}>
				Upscale Event Fired: {upscaleEvent ? 'Yes' : 'No'}
			</div>

			<div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
				<button
					data-testid="scale-btn-downscale"
					onClick={handleDownscale}>
					Downscale
				</button>
				<button data-testid="scale-btn-upscale" onClick={handleUpscale}>
					Upscale
				</button>
				<button data-testid="scale-btn-refresh" onClick={refreshState}>
					Refresh
				</button>
			</div>

			{error && (
				<div data-testid="scale-error" style={{ color: 'red' }}>
					Error: {error}
				</div>
			)}
		</div>
	);
}
