import { useState, useEffect, useCallback, useRef } from 'react';
import {
	RefreshCw,
	CheckCircle2,
	XCircle,
	AlertTriangle,
	Loader2,
} from 'lucide-react';
import {
	checkListStyle,
	checkRowStyle,
	checkLabelStyle,
	checkStatusStyle,
	checkDetailStyle,
	secondaryButtonStyle,
	setCardBadge,
} from './settingsStyles';

type HealthStatus = 'ok' | 'unavailable' | 'checking' | 'error';

interface WorkerCheck {
	label: string;
	status: HealthStatus;
	detail?: string;
}

function StatusIcon({ status }: { status: HealthStatus }) {
	switch (status) {
		case 'ok':
			return <CheckCircle2 size={16} style={{ color: '#22c55e' }} />;
		case 'unavailable':
			return <XCircle size={16} style={{ color: '#94a3b8' }} />;
		case 'error':
			return <AlertTriangle size={16} style={{ color: '#ef4444' }} />;
		case 'checking':
			return (
				<Loader2
					size={16}
					style={{
						color: '#3b82f6',
						animation: 'spin 1s linear infinite',
					}}
				/>
			);
	}
}

function statusLabel(status: HealthStatus): string {
	switch (status) {
		case 'ok':
			return 'Available';
		case 'unavailable':
			return 'Not Available';
		case 'error':
			return 'Error';
		case 'checking':
			return 'Checking...';
	}
}

export default function ReactSettingsHealth() {
	const [checks, setChecks] = useState<WorkerCheck[]>([]);
	const [running, setRunning] = useState(false);
	const anchorRef = useRef<HTMLSpanElement>(null);

	const runChecks = useCallback(async () => {
		setRunning(true);
		const results: WorkerCheck[] = [];

		results.push({
			label: 'Web Workers',
			status: typeof Worker !== 'undefined' ? 'ok' : 'unavailable',
			detail:
				typeof Worker !== 'undefined'
					? 'Dedicated workers supported'
					: 'Not supported in this browser',
		});

		results.push({
			label: 'Shared Workers',
			status: typeof SharedWorker !== 'undefined' ? 'ok' : 'unavailable',
			detail:
				typeof SharedWorker !== 'undefined'
					? 'Shared workers supported'
					: 'Not supported (Safari, some mobile)',
		});

		results.push({
			label: 'Service Workers',
			status: 'serviceWorker' in navigator ? 'ok' : 'unavailable',
			detail:
				'serviceWorker' in navigator
					? 'Service workers supported'
					: 'Not supported',
		});

		const gpu = (navigator as any).gpu;
		if (gpu) {
			try {
				const adapter = await gpu.requestAdapter();
				if (adapter) {
					const info = await adapter.requestAdapterInfo?.();
					results.push({
						label: 'WebGPU',
						status: 'ok',
						detail:
							info?.description ||
							info?.vendor ||
							'Adapter available',
					});
				} else {
					results.push({
						label: 'WebGPU',
						status: 'error',
						detail: 'No adapter found',
					});
				}
			} catch {
				results.push({
					label: 'WebGPU',
					status: 'error',
					detail: 'Failed to request adapter',
				});
			}
		} else {
			results.push({
				label: 'WebGPU',
				status: 'unavailable',
				detail: 'Not supported in this browser',
			});
		}

		try {
			const canvas = document.createElement('canvas');
			const gl =
				canvas.getContext('webgl2') || canvas.getContext('webgl');
			if (gl) {
				const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
				const renderer = debugInfo
					? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
					: 'Available';
				results.push({
					label: 'WebGL',
					status: 'ok',
					detail: String(renderer),
				});
			} else {
				results.push({
					label: 'WebGL',
					status: 'unavailable',
					detail: 'No WebGL context',
				});
			}
		} catch {
			results.push({
				label: 'WebGL',
				status: 'error',
				detail: 'Failed to create context',
			});
		}

		results.push({
			label: 'IndexedDB',
			status: typeof indexedDB !== 'undefined' ? 'ok' : 'unavailable',
			detail:
				typeof indexedDB !== 'undefined'
					? 'Available'
					: 'Not supported',
		});

		results.push({
			label: 'WebSocket',
			status: typeof WebSocket !== 'undefined' ? 'ok' : 'unavailable',
			detail:
				typeof WebSocket !== 'undefined'
					? 'Available'
					: 'Not supported',
		});

		results.push({
			label: 'BroadcastChannel',
			status:
				typeof BroadcastChannel !== 'undefined' ? 'ok' : 'unavailable',
			detail:
				typeof BroadcastChannel !== 'undefined'
					? 'Available'
					: 'Not supported',
		});

		setChecks(results);
		setRunning(false);
	}, []);

	useEffect(() => {
		runChecks();
	}, [runChecks]);

	useEffect(() => {
		const okCount = checks.filter((c) => c.status === 'ok').length;
		setCardBadge(
			anchorRef.current,
			checks.length > 0 ? `${okCount}/${checks.length} available` : null,
		);
	}, [checks]);

	return (
		<>
			<span ref={anchorRef} hidden aria-hidden="true" />
			<div style={checkListStyle}>
				{checks.map((check) => (
					<div key={check.label} style={checkRowStyle}>
						<StatusIcon status={check.status} />
						<span style={checkLabelStyle}>{check.label}</span>
						<span style={checkStatusStyle}>
							{statusLabel(check.status)}
						</span>
						{check.detail && (
							<span style={checkDetailStyle}>{check.detail}</span>
						)}
					</div>
				))}
			</div>

			<button
				onClick={runChecks}
				disabled={running}
				style={secondaryButtonStyle}>
				<RefreshCw
					size={14}
					style={
						running ? { animation: 'spin 1s linear infinite' } : {}
					}
				/>
				{running ? 'Checking...' : 'Re-check'}
			</button>
		</>
	);
}
